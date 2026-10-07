//ユーザのアカウントを削除する。現状削除した場合は、復元不可

import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} from 'discord.js';
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL);

export async function handleUnregisterCommand(interaction) {
  // 本人にのみ見える形で応答を開始 (64 = Ephemeral)
  await interaction.deferReply({ flags: 64 });

  const discordId = interaction.user.id;
  const username = interaction.user.username;

  try {
    // 1. PocketBase 管理者認証
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );
    }

    // 2. 対象ユーザーの存在チェック
    const record = await pb.collection('discord_users')
      .getFirstListItem(`discordId="${discordId}"`)
      .catch(() => null);

    if (!record) {
      return await interaction.editReply({
        content: `⚠️ **${username}** さんのアカウント情報はシステムに登録されていません。`
      });
    }

    const symbolAddress = record.symbolAddress;

    // 3. 確認用ボタンの作成
    const confirmButton = new ButtonBuilder()
      .setCustomId('confirm_unregister')
      .setLabel('はい（削除する）')
      .setStyle(ButtonStyle.Danger); // 赤色のボタン

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_unregister')
      .setLabel('いいえ（キャンセル）')
      .setStyle(ButtonStyle.Secondary); // 灰色のボタン

    const row = new ActionRowBuilder().addComponents(cancelButton, confirmButton);

    // 4. 確認メッセージとボタンを送信
    const confirmEmbed = new EmbedBuilder()
      .setColor('#E67E22')
      .setTitle('⚠️ アカウント削除の確認')
      .setDescription('**削除した場合、データを復元できませんが本当に削除しますか？**')
      .addFields(
        { name: '対象アカウント', value: username, inline: true },
        { name: '登録アドレス', value: `\`${symbolAddress}\``, inline: false },
        { name: '保有 GIVE 残高', value: `${record.give_balance} pt`, inline: true },
        { name: '保有 POINT 残高', value: `${record.point_balance} pt`, inline: true }
      )
      .setFooter({ text: '※60秒以内にボタンを選択してください。' });

    const response = await interaction.editReply({
      embeds: [confirmEmbed],
      components: [row]
    });

    // 5. ボタン押下イベントの収集 (60秒間のタイムアウト)
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    collector.on('collect', async (i) => {
      // 実行者本人以外の操作をブロック
      if (i.user.id !== interaction.user.id) {
        return await i.reply({
          content: '⚠️ 他のユーザーの確認ボタンは操作できません。',
          flags: 64
        });
      }

      if (i.customId === 'cancel_unregister') {
        // キャンセル処理
        await i.update({
          content: '❌ アカウント削除をキャンセルしました。',
          embeds: [],
          components: []
        });
        collector.stop('cancelled');

      } else if (i.customId === 'confirm_unregister') {
        // 削除実行処理
        try {
          // PocketBase からレコードを削除
          await pb.collection('discord_users').delete(record.id);

          const successEmbed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🗑️ アカウントを完全削除しました')
            .setDescription('感謝トークンシステムからあなたのアカウント情報を削除しました。')
            .addFields(
              { name: 'Discord ユーザー', value: username, inline: true },
              { name: '破棄された Symbol アドレス', value: `\`${symbolAddress}\``, inline: false }
            )
            .setTimestamp();

          await i.update({
            content: null,
            embeds: [successEmbed],
            components: [] // ボタンを削除
          });

          console.log(`🗑️ アカウント削除完了: ${username} (Addr:${symbolAddress})`);
          collector.stop('confirmed');

        } catch (err) {
          console.error('❌ アカウント削除処理エラー:', err);
          await i.update({
            content: `❌ アカウント削除中にエラーが発生しました。\n\`${err.message}\``,
            embeds: [],
            components: []
          });
          collector.stop('error');
        }
      }
    });

    // タイムアウト時の処理（ボタン放置時）
    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          content: '⏱️ 時間切れのため、削除リクエストをキャンセルしました。',
          embeds: [],
          components: []
        });
      }
    });

  } catch (err) {
    console.error('❌ unregisterコマンド初期化エラー:', err);
    await interaction.editReply({
      content: `❌ エラーが発生しました。\n\`${err.message}\``
    });
  }
}