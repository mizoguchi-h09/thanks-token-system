//残高確認用コマンド

import { EmbedBuilder } from 'discord.js';
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL);

export async function handleBalanceCommand(interaction) {
  // 本人にしか見えない応答準備（ローディング表示）
  await interaction.deferReply({ flags: 64 });

  const discordId = interaction.user.id;

  try {
    // 1. PocketBase からユーザー情報を取得
    const record = await pb.collection('discord_users')
      .getFirstListItem(`discordId="${discordId}"`)
      .catch(() => null);

    if (!record || !record.symbolAddress) {
      return await interaction.editReply({
        content: '⚠️ Symbolアドレスが登録されていません。管理者にお問い合わせいただくか、アドレス登録を行ってください。'
      });
    }

    const symbolAddress = record.symbolAddress;

    // 2. Symbol ノードから最新残高をリアルタイム取得 (オンチェーン照会)
    const response = await fetch(`${process.env.SYMBOL_NODE}/accounts/${symbolAddress}`);
    let giveBalance = 0;
    let pointBalance = 0;

    if (response.ok) {
      const accountData = await response.json();
      const mosaics = accountData.account.mosaics || [];

      const giveMosaicIdHex = process.env.MOSAIC_ID_GIVE.replace(/^0x/i, '').toLowerCase();
      const pointMosaicIdHex = process.env.MOSAIC_ID_POINT.replace(/^0x/i, '').toLowerCase();

      const giveMosaic = mosaics.find(m => m.id.toLowerCase() === giveMosaicIdHex);
      const pointMosaic = mosaics.find(m => m.id.toLowerCase() === pointMosaicIdHex);

      giveBalance = giveMosaic ? Number(giveMosaic.amount) : 0;
      pointBalance = pointMosaic ? Number(pointMosaic.amount) : 0;

      // 3. 取得した最新残高で DB を同期更新
      await pb.collection('discord_users').update(record.id, {
        give_balance: giveBalance,
        point_balance: pointBalance,
      });
    } else {
      // ノードエラー時は DB の値をフォールバック利用
      giveBalance = record.give_balance || 0;
      pointBalance = record.point_balance || 0;
    }

    // 4. 残高表示用の Embed メッセージを作成
    const balanceEmbed = new EmbedBuilder()
      .setColor('#4E75AF')
      .setTitle(`💳 ${interaction.user.username} さんのトークン残高`)
      .addFields(
        { name: '🎁 送信用 (Give トークン)', value: `**${giveBalance}** GIVE`, inline: true },
        { name: '🏆 獲得用 (Point トークン)', value: `**${pointBalance}** PT`, inline: true }
      )
      .setFooter({ text: 'Symbol Blockchain に直接同期された最新データです' })
      .setTimestamp();

    // 5. ユーザーに返答
    await interaction.editReply({ embeds: [balanceEmbed] });

  } catch (err) {
    console.error('残高確認エラー:', err);
    await interaction.editReply({ content: '❌ 残高の取得中にエラーが発生しました。' });
  }
}