import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} from 'discord.js';
import PocketBase from 'pocketbase';
import { executePointRevocation } from './shop_transaction.js';

const POCKETBASE_URL = process.env.POCKETBASE_URL;
const pb = new PocketBase(POCKETBASE_URL);

// 商品リスト定義
const ITEMS = [
  {
    id: 'item_wallpaper_01',
    name: 'デジタル壁紙',
    price: 100,
    code: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop',
    description: 'スマートフォン用の壁紙データです。',
    type: 'url'
  },
  {
    id: 'item_drink_160',
    name: 'ドリンク引き換えチケット',
    price: 10,
    code: 'TICKET_DRINK_REAL',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop',
    description: 'ドリンク1本と引き換えできる対面用デジタルチケットです。',
    type: 'ticket' // Discord内消し込み対象
  },
  {
    id: 'item_coupon_500',
    name: 'デジタルギフト券 500円分',
    price: 100,
    code: 'GIFT-TEST-5678',
    image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop',
    description: 'オンラインで利用可能なギフトコードです。',
    type: 'code'
  }
];

/**
 * PocketBase からユーザーの最新残高を取得する関数
 */
async function getUserPointBalance(discordId) {
  try {
    if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
      await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
    }
    const user = await pb.collection('discord_users').getFirstListItem(`discordId="${discordId}"`);
    return user ? (user.point_balance || 0) : 0;
  } catch (err) {
    console.warn(`⚠️ 残高取得失敗 (DiscordId: ${discordId}):`, err.message);
    return 0;
  }
}

/**
 * カタログ UI レンダリング関数 (残高 pointBalance を引数に追加)
 */
function renderItemCard(index, pointBalance = 0) {
  const item = ITEMS[index];
  const total = ITEMS.length;

  const embed = new EmbedBuilder()
    .setTitle(`ポイントショップ (${index + 1}/${total})`)
    .setDescription(
      `💰 **現在の保有ポイント**: \`${pointBalance} pt\`\n\n` +
      `### ${item.name}\n` +
      `必要ポイント: \`${item.price} pt\`\n\n` +
      `${item.description}`
    )
    .setImage(item.image)
    .setColor(pointBalance >= item.price ? 0x5865F2 : 0x94A3B8)
    .setFooter({ text: '前へ / 次へ ボタンで商品を移動できます' });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`shop_page_${index - 1}`)
    .setLabel('前へ')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === 0);

  // ポイント不足の場合はボタンを無効化（誤操作防止）
  const buyBtn = new ButtonBuilder()
    .setCustomId(`shop_prompt_${index}`)
    .setLabel(pointBalance >= item.price ? 'この商品を交換する' : 'ポイント不足')
    .setStyle(pointBalance >= item.price ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(pointBalance < item.price);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`shop_page_${index + 1}`)
    .setLabel('次へ')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === total - 1);

  const row = new ActionRowBuilder().addComponents(prevBtn, buyBtn, nextBtn);

  return { embeds: [embed], components: [row] };
}

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('ポイントショップを開きます'),

  async execute(interaction) {
    // 1. 最新の point_balance を取得
    const balance = await getUserPointBalance(interaction.user.id);
    const card = renderItemCard(0, balance);
    await interaction.reply({ ...card, flags: MessageFlags.Ephemeral });
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    // 1. カタログのページ移動（前へ / 次へ）
    if (customId.startsWith('shop_page_')) {
      const targetIndex = parseInt(customId.replace('shop_page_', ''), 10);
      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= ITEMS.length) return;

      // 最新の残高を取得して再描画
      const balance = await getUserPointBalance(interaction.user.id);
      const card = renderItemCard(targetIndex, balance);
      return await interaction.update(card);
    }

    // 2. 購入確認画面
    if (customId.startsWith('shop_prompt_')) {
      const index = parseInt(customId.replace('shop_prompt_', ''), 10);
      const item = ITEMS[index];
      const balance = await getUserPointBalance(interaction.user.id);

      const confirmEmbed = new EmbedBuilder()
        .setTitle('購入内容の確認')
        .setDescription(
          `以下の商品を交換しますか？\n\n` +
          `商品名: **${item.name}**\n` +
          `必要ポイント: **${item.price} pt**\n` +
          `現在の所持ポイント: **${balance} pt** ➔ 交換後: **${balance - item.price} pt**`
        )
        .setImage(item.image)
        .setColor(0xFFCC00);

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`shop_exec_${index}`)
        .setLabel('確定して交換する')
        .setStyle(ButtonStyle.Success);

      const backBtn = new ButtonBuilder()
        .setCustomId(`shop_page_${index}`)
        .setLabel('キャンセルして戻る')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(confirmBtn, backBtn);
      return await interaction.update({ embeds: [confirmEmbed], components: [row] });
    }

    // 3. ポイント引き落とし・チケット発行処理
    if (customId.startsWith('shop_exec_')) {
      await interaction.update({ 
        content: '⏳ 決済およびブロックチェーン処理を行っています...しばらくお待ちください。', 
        embeds: [], 
        components: [] 
      });

      const index = parseInt(customId.replace('shop_exec_', ''), 10);
      const item = ITEMS[index];
      const userName = interaction.user.displayName || interaction.user.username;

      const result = await executePointRevocation(interaction.user.id, item, userName);

      if (!result.success) {
        return await interaction.editReply({ content: result.error });
      }

      // 【対面用チケット（type: 'ticket'）の場合】
      if (item.type === 'ticket' && result.ticketId) {
        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 デジタル引換チケット')
          .setDescription(`**【 ${item.name} 】**\n\nスタッフに見せて、下の「使用する」ボタンを押してください。`)
          .setImage(item.image)
          .addFields(
            { name: '所有者', value: `\`${userName}\``, inline: true },
            { name: 'ステータス', value: '🟢 **未使用 (有効)**', inline: true },
            { name: 'チケットID', value: `\`${result.ticketId}\``, inline: true },
            { name: '現在のポイント残高', value: `${result.newBalance} pt`, inline: false }
          )
          .setColor(0x22C55E)
          .setFooter({ text: '※スタッフの目の前でボタンを押してください' })
          .setTimestamp();

        const useBtn = new ButtonBuilder()
          .setCustomId(`shop_useticket_${result.ticketId}`)
          .setLabel('タップして使用')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(useBtn);

        return await interaction.editReply({
          content: '🎉 **交換が完了しました！**',
          embeds: [ticketEmbed],
          components: [row]
        });
      }

      // 【通常デジタルコード/URL商品の場合】
      const fieldName = item.type === 'url' ? '受取リンク' : '引き渡しコード';
      const fieldValue = item.type === 'url' ? `[ここをクリックして受け取る](${item.code})` : `\`${item.code}\``;

      const successEmbed = new EmbedBuilder()
        .setTitle('🎉 交換が完了しました')
        .setDescription(`**${item.name}** の受け取りが完了しました。`)
        .setImage(item.image)
        .addFields(
          { name: '所有者', value: `\`${userName}\``, inline: true },
          { name: fieldName, value: fieldValue, inline: false },
          { name: '残高', value: `${result.newBalance} pt`, inline: true }
        )
        .setColor(0x00FF00);

      return await interaction.editReply({ content: null, embeds: [successEmbed], components: [] });
    }

    // 4. 【消し込み処理】「タップして使用」ボタン押下時
    if (customId.startsWith('shop_useticket_')) {
      await interaction.deferUpdate();

      const customTicketId = customId.replace('shop_useticket_', '');

      try {
        if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
          await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
        }

        const ticket = await pb.collection('tickets').getFirstListItem(`ticketId="${customTicketId}"`);

        if (ticket.status === 'used') {
          return await interaction.followUp({
            content: '⚠️ このチケットはすでに使用済みです。',
            flags: MessageFlags.Ephemeral
          });
        }

        await pb.collection('tickets').update(ticket.id, {
          status: 'used',
          usedAt: new Date().toISOString()
        });

        const usedEmbed = new EmbedBuilder()
          .setTitle('🔴 デジタル引換チケット (使用済み)')
          .setDescription(`**【 ${ticket.itemName} 】**\n\nこのチケットは使用が完了しました。`)
          .addFields(
            { name: '所有者', value: `\`${ticket.userName || '不明'}\``, inline: true },
            { name: 'ステータス', value: '🔴 **利用済み (無効)**', inline: true },
            { name: 'チケットID', value: `\`${ticket.ticketId || ticket.id}\``, inline: true }
          )
          .setColor(0xEF4444)
          .setFooter({ text: `使用日時: ${new Date().toLocaleString('ja-JP')}` });

        const disabledBtn = new ButtonBuilder()
          .setCustomId(`disabled_${customTicketId}`)
          .setLabel('済（使用完了）')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const row = new ActionRowBuilder().addComponents(disabledBtn);

        await interaction.editReply({
          content: '✅ **引き換えが完了しました！**',
          embeds: [usedEmbed],
          components: [row]
        });

      } catch (error) {
        console.error('チケット消し込みエラー:', error);
        await interaction.followUp({
          content: '❌ チケットの処理中にエラーが発生しました。',
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};