import 'dotenv/config';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { PrivateKey } from 'symbol-sdk';
import { NetworkTimestamp, SymbolFacade, generateMosaicAliasId, models } from 'symbol-sdk/symbol';

// ==========================================================
// Symbol 送金まわりの設定
// ==========================================================
const NODE_URL = process.env.NODE_URL || 'https://reference.symboltest.net:3001';
const WS_URL = NODE_URL.replace(/^http/, 'ws') + '/ws';

const privateKeyHex = process.env.SIGNER_PRIVATE_KEY;
if (!privateKeyHex) {
  console.error('エラー: 秘密鍵(SIGNER_PRIVATE_KEY)が設定されていません。');
  process.exit(1);
}

const signerKeyPair = new SymbolFacade.KeyPair(new PrivateKey(privateKeyHex));
const facade = new SymbolFacade('testnet');
const MONITOR_ADDRESS = facade.network.publicKeyToAddress(signerKeyPair.publicKey).toString();

// コインリアクション（カスタム絵文字名）-> 送金量（XYM）の対応表
const COIN_REACTIONS = {
  token_1: 1,
  token_5: 5,
  token_10: 10,
  token_50: 50,
  token_100: 100
};

// ---- テスト用設定 ----
// 本来はリアクションされたメッセージの投稿者のアドレスへ送金しますが、
// テスト中はこの固定アドレス宛に送金します。
// 本番運用に切り替える際は TEST_MODE を false にしてください
// （addresses.json による投稿者アドレス解決に戻ります）。
const TEST_MODE = true;
const TEST_RECIPIENT_ADDRESS = '';//送金先アドレス

// Discordユーザーid -> Symbolアドレス の事前登録マップ（addresses.json）
const ADDRESS_MAP_PATH = new URL('./addresses.json', import.meta.url);

function loadAddressMap() {
  try {
    const raw = fs.readFileSync(ADDRESS_MAP_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('addresses.json の読み込みに失敗しました:', error.message);
    return {};
  }
}

// 同一メッセージ・同一絵文字・同一リアクション者からの二重送金を防ぐ
const processedReactions = new Set();

/**
 * Symbolでの送金処理（元の自動送金スクリプトをベースに、関数化・エラーを呼び出し元に伝播）
 * @param {string} recipientAddress 送金先アドレス
 * @param {number} amountXym 送金額（XYM単位）
 */
async function sendSymbolPayment(recipientAddress, amountXym) {
  const websocket = new WebSocket(WS_URL);

  try {
    const uid = await new Promise((resolve, reject) => {
      websocket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.uid) resolve(message.uid);
      }, { once: true });
      websocket.addEventListener('error', () => reject(new Error('WebSocket接続に失敗しました')));
    });

    const channels = [`confirmedAdded/${MONITOR_ADDRESS}`, `status/${MONITOR_ADDRESS}`];
    for (const channel of channels) {
      websocket.send(JSON.stringify({ uid, subscribe: channel }));
    }

    const timeResponse = await fetch(`${NODE_URL}/node/time`);
    const timeJSON = await timeResponse.json();
    const timestamp = new NetworkTimestamp(timeJSON.communicationTimestamps.receiveTimestamp);

    const feeResponse = await fetch(`${NODE_URL}/network/fees/transaction`);
    const feeJSON = await feeResponse.json();
    const feeMultiplier = Math.max(feeJSON.medianFeeMultiplier, feeJSON.minFeeMultiplier);

    // XYMは小数点6桁（1 XYM = 1_000_000 マイクロXYM）
    const amountMicro = BigInt(amountXym) * 1_000_000n;

    const transaction = facade.transactionFactory.create({
      type: 'transfer_transaction_v1',
      signerPublicKey: signerKeyPair.publicKey.toString(),
      deadline: timestamp.addHours(2).timestamp,
      recipientAddress,
      mosaics: [{ mosaicId: generateMosaicAliasId('symbol.xym'), amount: amountMicro }]
    });
    transaction.fee = new models.Amount(BigInt(feeMultiplier * transaction.size));

    const signature = facade.signTransaction(signerKeyPair, transaction);
    const jsonPayload = facade.transactionFactory.static.attachSignature(transaction, signature);
    const transactionHash = facade.hashTransaction(transaction).toString();

    const confirmationPromise = new Promise((resolve, reject) => {
      websocket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        const channelName = message.topic?.split('/')[0];

        if (channelName === 'confirmedAdded' && message.data?.meta?.hash === transactionHash) {
          resolve();
        }
        if (channelName === 'status' && message.data?.hash === transactionHash) {
          reject(new Error(`送金失敗（理由: ${message.data.code}）`));
        }
      });
    });

    const putResponse = await fetch(`${NODE_URL}/transactions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: jsonPayload
    });

    if (!putResponse.ok) {
      throw new Error(`トランザクションの送信に失敗しました（HTTP ${putResponse.status}）`);
    }

    await confirmationPromise;
    console.log(`送金成功: ${amountXym} XYM -> ${recipientAddress} (hash: ${transactionHash})`);
  } finally {
    websocket.close();
  }
}

// ==========================================================
// Discord Bot
// ==========================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

client.once('clientReady', async () => {
  console.log(`${client.user.tag} 起動成功！`);

  try {
    const channel = client.channels.cache.find(
      ch => ch.name === '一般' && ch.isTextBased()
    );

    if (channel) {
      await channel.send('こんにちは！Botが起動しました');
      console.log(`「${channel.name}」チャンネルにメッセージを送信しました。`);
    } else {
      console.log('「一般」という名前のチャンネルが見つかりませんでした。');
    }
  } catch (error) {
    console.error('メッセージの送信中にエラーが発生しました:', error.message);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('リアクションデータの取得に失敗しました:', error);
      return;
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      console.error('メッセージデータの取得に失敗しました:', error);
      return;
    }
  }

  const emojiName = reaction.emoji.name;
  const amount = COIN_REACTIONS[emojiName];

  // まずは検知した内容を必ずログ出力する（対象/対象外を問わず）
  console.log(`[リアクション検知] ${user.username} が「${emojiName}」をつけました`);

  if (!amount) {
    console.log(`[対象外] 「${emojiName}」はコインリアクションに該当しません。`);
    return;
  }

  console.log(`[対象] 「${emojiName}」はコインリアクションです（${amount} XYM相当）。送金処理へ進みます。`);

  const messageAuthor = reaction.message.author;

  // 通常運用時は投稿者が取得できない場合やBotの投稿は無視するが、
  // テストモード中は固定アドレス宛に送金するのでこのチェックをスキップする
  if (!TEST_MODE) {
    if (!messageAuthor || messageAuthor.bot) {
      console.log('[送金スキップ] メッセージ投稿者が取得できないか、Botの投稿です。');
      return;
    }
  }

  // 自分の投稿に自分でリアクションしても送金しない
  if (messageAuthor?.id === user.id) {
    console.log(`[送金スキップ] ${user.username} が自分の投稿にリアクションしました。`);
    return;
  }

  // 二重送金防止
  const dedupeKey = `${reaction.message.id}:${emojiName}:${user.id}`;
  if (processedReactions.has(dedupeKey)) return;
  processedReactions.add(dedupeKey);

  console.log(`[コインリアクション検知] ${user.username} が ${messageAuthor?.username ?? '(投稿者不明)'} に「${emojiName}」をつけました`);

  let recipientAddress;

  if (TEST_MODE) {
    recipientAddress = TEST_RECIPIENT_ADDRESS;
    console.log(`[テストモード] 固定アドレス宛に送金します: ${recipientAddress}`);
  } else {
    const addressMap = loadAddressMap();
    recipientAddress = addressMap[messageAuthor.id];

    if (!recipientAddress) {
      console.log(`[送金スキップ] ${messageAuthor.username} (id: ${messageAuthor.id}) のSymbolアドレスが addresses.json に登録されていません。`);
      return;
    }
  }

  try {
    await sendSymbolPayment(recipientAddress, amount);
  } catch (error) {
    console.error('送金処理中にエラーが発生しました:', error.message);
    // 失敗時は再度リアクションし直せば再送金できるようにする
    processedReactions.delete(dedupeKey);
  }
});

client.login(process.env.TOKEN);