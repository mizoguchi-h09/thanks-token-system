import 'dotenv/config';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

const {
  SYMBOL_NODE,
  NETWORK_TYPE,
  SYMBOL_PRIVATE_KEY,
  MOSAIC_ID_GIVE,
  MOSAIC_ID_POINT,
  POCKETBASE_URL,
} = process.env;

const pb = new PocketBase(POCKETBASE_URL);

/**
 * PocketBase から Discord ID に紐づく Symbol アドレスを取得
 */
async function getSymbolAddressByDiscordId(discordId) {
  try {
    const record = await pb.collection('discord_users').getFirstListItem(`discordId="${discordId}"`);
    return record.symbolAddress || null;
  } catch (err) {
    return null;
  }
}

export async function processTokenTransaction({ senderUser, receiverUser, amount, emoji, messageId }) {
  // 1. ユーザーA（送信者）とユーザーB（受信者）のアドレスを取得
  const senderAddressPlain = await getSymbolAddressByDiscordId(senderUser.id);
  const receiverAddressPlain = await getSymbolAddressByDiscordId(receiverUser.id);

  if (!senderAddressPlain || !receiverAddressPlain) {
    const unregistered = [];
    if (!senderAddressPlain) unregistered.push(`${senderUser.username} (送信者)`);
    if (!receiverAddressPlain) unregistered.push(`${receiverUser.username} (受信者)`);
    throw new Error(`AddressNotRegistered: ${unregistered.join(', ')}`);
  }

  const facade = new SymbolFacade(NETWORK_TYPE);
  const adminPrivateKey = new PrivateKey(SYMBOL_PRIVATE_KEY.trim());
  const adminKeyPair = new KeyPair(adminPrivateKey);

  const senderAddress = new Address(senderAddressPlain);   // ユーザーAのアドレス
  const receiverAddress = new Address(receiverAddressPlain); // ユーザーBのアドレス
  const tokenAmount = BigInt(amount);

  const mosaicGive = BigInt(`0x${MOSAIC_ID_GIVE.replace(/^0x/i, '')}`);
  const mosaicPoint = BigInt(`0x${MOSAIC_ID_POINT.replace(/^0x/i, '')}`);

// --------------------------------------------------
  // 1. ブロックチェーンに書き込むメッセージを作成
  // --------------------------------------------------
  // 例: "From: hitomi02411 To: mizo0268 (token_5)"
  const noteText = `From: ${senderUser.username} To: ${receiverUser.username} (${emoji})`;
  
  // 文字列を Uint8Array に変換し、先頭に 0x00 (PlainText 識別子) を付与
  const textBytes = new TextEncoder().encode(noteText);
  const messageBytes = new Uint8Array([0x00, ...textBytes]);

  // --------------------------------------------------
  // 2. インナートランザクションの構築
  // --------------------------------------------------

  // ① ユーザーAから GIVE モザイクを回収 (Revocate)
  const innerCollectTx = facade.transactionFactory.createEmbedded({
    type: 'mosaic_supply_revocation_transaction_v1',
    signerPublicKey: adminKeyPair.publicKey,
    sourceAddress: senderAddress,
    mosaic: {
      mosaicId: mosaicGive,
      amount: tokenAmount
    }
  });

  // ② ユーザーBへ POINT モザイクを付与 & メッセージ記録 (Transfer)
  const innerGrantTx = facade.transactionFactory.createEmbedded({
    type: 'transfer_transaction_v1',
    signerPublicKey: adminKeyPair.publicKey,
    recipientAddress: receiverAddress,
    mosaics: [
      {
        mosaicId: mosaicPoint,
        amount: tokenAmount
      }
    ],
    message: messageBytes // ★ ここに「誰が誰に送ったか」のメッセージを追加
  });

  const innerTransactions = [innerCollectTx, innerGrantTx];

  // --------------------------------------------------
  // アグリゲートコンプリート Tx (v3) の構築と署名
  // --------------------------------------------------
  const merkleHash = facade.static.hashEmbeddedTransactions(innerTransactions);
  const deadline = facade.now().addSeconds(7200).timestamp;

  const aggregateTx = facade.transactionFactory.create({
    type: 'aggregate_complete_transaction_v3',
    signerPublicKey: adminKeyPair.publicKey,
    fee: 0n,
    deadline: deadline,
    transactionsHash: merkleHash,
    transactions: innerTransactions
  });

  // 手数料計算 (サイズ x 100)
  aggregateTx.fee.value = BigInt(aggregateTx.size * 100);

  // 署名 & アタッチ
  const signature = facade.signTransaction(adminKeyPair, aggregateTx);
  const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);
  const txHash = facade.hashTransaction(aggregateTx).toString();

  // --------------------------------------------------
  // ノードへアナウンス
  // --------------------------------------------------
  const response = await fetch(`${SYMBOL_NODE}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson
  });

  const result = await response.json();


  return { txHash, result };
}