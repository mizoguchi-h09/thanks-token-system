import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} from 'discord.js';
import { executePointRevocation } from './shop_transaction.js';

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
    price: 800,
    code: 'https://example.com/gift/ticket-sample',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop',
    description: 'ドリンク1本と引き換えできる電子チケットです。',
    type: 'url'
  },
  {
    id: 'item_coupon_500',
    name: 'デジタルギフト券 500円分',
    price: 2000,
    code: 'GIFT-TEST-5678',
    image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=600&auto=format&fit=crop',
    description: 'オンラインで利用可能なギフトコードです。',
    type: 'code'
  }
];

// カタログ UI のレンダリング関数
function renderItemCard(index) {
  const item = ITEMS[index];
  const total = ITEMS.length;

  const embed = new EmbedBuilder()
    .setTitle(`ポイントショップ (${index + 1}/${total})`)
    .setDescription(`### ${item.name}\n必要ポイント: \`${item.price} pt\`\n\n${item.description}`)
    .setImage(item.image)
    .setColor(0x5865F2)
    .setFooter({ text: '前へ / 次へ ボタンで商品を移動できます' });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`shop_page_${index - 1}`)
    .setLabel('前へ')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === 0);

  const buyBtn = new ButtonBuilder()
    .setCustomId(`shop_prompt_${index}`)
    .setLabel('この商品を交換する')
    .setStyle(ButtonStyle.Primary);

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
    const card = renderItemCard(0);
    await interaction.reply({ ...card, flags: MessageFlags.Ephemeral });
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    // 1. ページ切り替え（前へ / 次へ）
    if (customId.startsWith('shop_page_')) {
      const targetIndex = parseInt(customId.replace('shop_page_', ''), 10);
      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= ITEMS.length) return;

      const card = renderItemCard(targetIndex);
      return await interaction.update(card);
    }

    // 2. 購入確認画面への推移
    if (customId.startsWith('shop_prompt_')) {
      const index = parseInt(customId.replace('shop_prompt_', ''), 10);
      const item = ITEMS[index];

      const confirmEmbed = new EmbedBuilder()
        .setTitle('購入内容の確認')
        .setDescription(`以下の商品を交換しますか？\n\n商品名: **${item.name}**\n必要ポイント: **${item.price} pt**`)
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

    // 3. トランザクション実行・交換処理（モジュール呼出）
    if (customId.startsWith('shop_exec_')) {
      const index = parseInt(customId.replace('shop_exec_', ''), 10);
      const item = ITEMS[index];

      await interaction.update({ content: '決済処理を行っています...', embeds: [], components: [] });

      // shop_transaction.js から Point 回収ロジックを実行
      const result = await executePointRevocation(interaction.user.id, item.price);

      if (!result.success) {
        return await interaction.editReply({
          content: result.error
        });
      }

      // 成功通知 Embed の返答
      const fieldName = item.type === 'url' ? '受取リンク' : '引き渡しコード';
      const fieldValue = item.type === 'url' ? `[ここをクリックして受け取る](${item.code})` : `\`${item.code}\``;

      const successEmbed = new EmbedBuilder()
        .setTitle('🎉 交換が完了しました')
        .setDescription(`**${item.name}** の受け取りが完了しました。`)
        .setImage(item.image)
        .addFields(
          { name: fieldName, value: fieldValue },
          { name: '残高', value: `${result.newBalance} pt` }
        )
        .setColor(0x00FF00);

      await interaction.editReply({ content: null, embeds: [successEmbed], components: [] });
    }
  }
};