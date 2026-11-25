import PocketBase from 'pocketbase';
import { processTokenTransaction } from './transactions.js';

const pb = new PocketBase(process.env.POCKETBASE_URL);

// ★ 追加: 連打による二重送信を防ぐための一時ロック
const processingReactions = new Set();

const POINT_EMOJIS = {
  'token_1': 1,
  'token_5': 5,
  'token_10': 10,
  'token_30': 30,
};

async function syncUserBalances(discordId) {
  try {
    const record = await pb.collection('discord_users').getFirstListItem(`discordId="${discordId}"`);
    const symbolAddress = record.symbolAddress;

    if (!symbolAddress) return { giveBalance: 0, pointBalance: 0 };

    const cleanAddress = symbolAddress.replace(/-/g, '').trim();
    const response = await fetch(`${process.env.SYMBOL_NODE}/accounts/${cleanAddress}`);
    if (!response.ok) return { giveBalance: record.give_balance || 0, pointBalance: record.point_balance || 0 };

    const accountData = await response.json();
    const mosaics = accountData.account?.mosaics || [];

    const giveMosaicId = BigInt(`0x${process.env.MOSAIC_ID_GIVE.replace(/^0x/i, '')}`);
    const pointMosaicId = BigInt(`0x${process.env.MOSAIC_ID_POINT.replace(/^0x/i, '')}`);

    const giveMosaic = mosaics.find(m => BigInt(`0x${m.id}`) === giveMosaicId);
    const pointMosaic = mosaics.find(m => BigInt(`0x${m.id}`) === pointMosaicId);

    const giveBalance = giveMosaic ? Number(giveMosaic.amount) : 0;
    const pointBalance = pointMosaic ? Number(pointMosaic.amount) : 0;

    await pb.collection('discord_users').update(record.id, {
      give_balance: giveBalance,
      point_balance: pointBalance,
    });

    console.log(`🔄 残高同期完了 [${record.discordId}]: GIVE=${giveBalance}, POINT=${pointBalance}`);
    return { giveBalance, pointBalance };
  } catch (err) {
    console.error(`⚠️ 残高同期エラー (discord_id: ${discordId}):`, err.message);
    return { giveBalance: 0, pointBalance: 0 };
  }
}

async function waitForConfirmationAndSync(txHash, senderDiscordId, receiverDiscordId) {
  if (!txHash) return;

  console.log(`ブロックチェーンの承認待ち中... (TxHash: ${txHash})`);
  
  for (let i = 0; i < 12; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      const res = await fetch(`${process.env.SYMBOL_NODE}/transactionStatus/${txHash}`);
      if (!res.ok) continue;

      const status = await res.json();
      console.log(`  └ ステータス確認 [${i + 1}/12]: ${status.group}`);

      if (status.group === 'confirmed') {
        console.log('✅ トランザクションがオンチェーンで確定しました！残高を同期します。');
        await syncUserBalances(senderDiscordId);
        await syncUserBalances(receiverDiscordId);
        return;
      } else if (status.group === 'failed') {
        console.error(`❌ トランザクションが拒否されました (理由: ${status.code})。DB同期をスキップします。`);
        return;
      }
    } catch (e) {}
  }

  console.warn('⚠️ 60秒以内に承認が確認できなかったため、後処理の同期を打ち切りました。');
}

export async function handleReactionAdd(reaction, user) {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('メッセージの取得に失敗しました:', error);
      return;
    }
  }

  const senderUser = user;
  const receiverUser = reaction.message.author;
  const emojiName = reaction.emoji.name;
  const messageId = reaction.message.id;
  const amount = POINT_EMOJIS[emojiName] || 0;

  let txHash = '';

  if (senderUser.id === receiverUser.id) {
    console.log('自分の投稿へのリアクションのため送金をスキップしました。');
    return;
  }

  // 普通のリアクション（トークン対象外）
  if (!amount) {
    console.log(`\n💬 リアクション検知 (対象外): ${senderUser.username} ➔ ${receiverUser.username} [${emojiName}]`);
    
    try {
      await pb.collection('token_logs').create({
        senderName: senderUser.username,
        receiverName: receiverUser.username,
        emoji: emojiName,
        amount: 0,
        transactionHash: '',
        messageId: messageId // ★ 追加
      });
      console.log('📝 token_logs へログを保存しました (通常リアクション)。');
    } catch (dbErr) {
      console.error('⚠️ PocketBase へのログ保存失敗:', dbErr);
    }
    return;
  }

  // --- ここからトークン送金対象のリアクション処理 ---

  // ★ 追加: 連打ロック確認
  const lockKey = `${messageId}_${senderUser.id}_${emojiName}`;
  if (processingReactions.has(lockKey)) {
    console.log(`⏭️ 処理中のため重複リアクションをスキップ: ${senderUser.username} [${emojiName}]`);
    return;
  }
  processingReactions.add(lockKey);

  try {
    // ★ 追加: 既存の token_logs から同じ投稿・同じ人・同じ絵文字の送金済み履歴を検索
    const alreadySent = await pb.collection('token_logs')
      .getFirstListItem(`messageId="${messageId}" && senderName="${senderUser.username}" && emoji="${emojiName}" && amount > 0`)
      .catch(() => null);

    if (alreadySent) {
      console.log(`⏭️ 既に同じ投稿へ同じリアクションで送金済みのためスキップしました: ${senderUser.username} [${emojiName}]`);
      return;
    }

    // 1. 事前残高チェック
    const { giveBalance: senderGiveBalance } = await syncUserBalances(senderUser.id);

    if (senderGiveBalance < amount) {
      console.log(`🛑 残高不足のためキャンセル: ${senderUser.username} (保有: ${senderGiveBalance}pt, 必要: ${amount}pt)`);
      return;
    }

    console.log(`\n✨ リアクション検知 (${amount}pt): ${senderUser.username} ➔ ${receiverUser.username} [${emojiName}]`);

    // 2. 送金実行
    const result = await processTokenTransaction({
      senderUser,
      receiverUser,
      amount,
      emoji: emojiName,
      messageId: messageId
    });

    txHash = result.txHash;
    console.log(`🔗 送信完了！ (GIVE-${amount} ➔ POINT+${amount}) | Tx Hash: ${txHash}`);

    // 3. トークン送金用ログ保存（messageId も一緒に保存）
    try {
      await pb.collection('token_logs').create({
        senderName: senderUser.username,
        receiverName: receiverUser.username,
        emoji: emojiName,
        amount: Number(amount),
        transactionHash: txHash,
        messageId: messageId // ★ 追加
      });
      console.log('📝 token_logs へログを保存しました。');
    } catch (dbErr) {
      console.error('⚠️ PocketBase へのログ保存失敗:', dbErr);
    }

    // 4. ブロック承認完了後に残高同期
    waitForConfirmationAndSync(txHash, senderUser.id, receiverUser.id);

  } catch (err) {
    if (err.message?.startsWith('AddressNotRegistered:')) {
      const unregisteredInfo = err.message.replace('AddressNotRegistered: ', '');
      try {
        await reaction.message.channel.send(
          `⚠️ トークン送金失敗: アドレスが PocketBase に登録されていません。\n> 未登録: **${unregisteredInfo}**`
        );
      } catch (msgErr) {}
    } else {
      console.error('❌ トランザクション処理エラー:', err);
    }
  } finally {
    // ★ 追加: ロックを必ず解除
    processingReactions.delete(lockKey);
  }
}