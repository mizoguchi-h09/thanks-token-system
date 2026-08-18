//リアクションを検知するファイル

import PocketBase from 'pocketbase';
import { processTokenTransaction } from './transactions.js';

const pb = new PocketBase(process.env.POCKETBASE_URL);

const POINT_EMOJIS = {
  'token_1': 1,
  'token_5': 5,
  'token_10': 10,
  'token_50': 50,
  'token_100': 100,
};

// ★ Symbol から残高を取得して PocketBase (discord_users) を更新する内部関数
async function syncUserBalances(discordId) {
  try {
    // 1. PocketBase からユーザー情報を取得
    const record = await pb.collection('discord_users').getFirstListItem(`discordId="${discordId}"`);
    const symbolAddress = record.symbolAddress;

    if (!symbolAddress) return;

    // 2. Symbol ノードから残高を取得
    const response = await fetch(`${process.env.SYMBOL_NODE}/accounts/${symbolAddress}`);
    if (!response.ok) return;

    const accountData = await response.json();
    const mosaics = accountData.account.mosaics || [];

    const giveMosaicIdHex = process.env.MOSAIC_ID_GIVE.replace(/^0x/i, '').toLowerCase();
    const pointMosaicIdHex = process.env.MOSAIC_ID_POINT.replace(/^0x/i, '').toLowerCase();

    const giveMosaic = mosaics.find(m => m.id.toLowerCase() === giveMosaicIdHex);
    const pointMosaic = mosaics.find(m => m.id.toLowerCase() === pointMosaicIdHex);

    const giveBalance = giveMosaic ? Number(giveMosaic.amount) : 0;
    const pointBalance = pointMosaic ? Number(pointMosaic.amount) : 0;

    // 3. PocketBase の残高フィールドを更新
    await pb.collection('discord_users').update(record.id, {
      give_balance: giveBalance,
      point_balance: pointBalance,
    });

    console.log(`🔄 残高同期完了 [${record.discord_id}]: GIVE=${giveBalance}, POINT=${pointBalance}`);
  } catch (err) {
    console.error(`⚠️ 残高同期エラー (discord_id: ${discordId}):`, err.message);
  }
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
  const amount = POINT_EMOJIS[emojiName] || 0;

  let txHash = '';

  try {
    if (!amount) {
      console.log(`${senderUser.username} が ${receiverUser.username} に ${emojiName} でリアクションしました`);
      return;
    }

    if (senderUser.id === receiverUser.id) {
      console.log('ℹ️ 自分の投稿へのリアクションのため送金をスキップしました。');
      return;
    }

    console.log(`\n✨ トークン送金検知 (${amount}pt): ${senderUser.tag} ➔ ${receiverUser.tag}`);

    // 送金実行
    const result = await processTokenTransaction({
      senderUser,
      receiverUser,
      amount,
      emoji: emojiName,
      messageId: reaction.message.id
    });

    txHash = result.txHash;
    console.log(`🔗 書き込み完了！ (GIVE-${amount} ➔ POINT+${amount})`);
    console.log(`★ Tx Hash: ${txHash}`);

    // ★ トランザクション承認のタイムラグを考慮し、5秒後に送金者・受信者の残高を自動同期
    setTimeout(() => {
      syncUserBalances(senderUser.id);
      syncUserBalances(receiverUser.id);
    }, 5000);

  } catch (err) {
    if (err.message.startsWith('AddressNotRegistered:')) {
      const unregisteredInfo = err.message.replace('AddressNotRegistered: ', '');
      console.log(`⚠️ アドレス未登録: ${unregisteredInfo}`);

      try {
        await reaction.message.channel.send(
          `⚠️ トークン送金失敗: アドレスが PocketBase に登録されていません。\n> 未登録: **${unregisteredInfo}**`
        );
      } catch (msgErr) {
        console.error('Discord メッセージ送信エラー:', msgErr);
      }
    } else {
      console.error('❌ トランザクション処理エラー:', err);
    }
  } finally {
    // PocketBase へのログ保存
    try {
      await pb.collection('token_logs').create({
        senderName: senderUser.username,
        receiverName: receiverUser.username,
        emoji: emojiName,
        amount: Number(amount),
        transactionHash: txHash
      });
      console.log('📝 token_logs へログを保存しました。');
    } catch (dbErr) {
      console.error('⚠️ PocketBase へのログ保存に失敗しました:');
      if (dbErr.data) {
        console.error(JSON.stringify(dbErr.data, null, 2));
      } else {
        console.error(dbErr);
      }
    }
  }
}