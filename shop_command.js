import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} from 'discord.js';
import * as symbolSdkAll from 'symbol-sdk';
import * as dbModule from './db.js';

const symbol = (() => {
  if (symbolSdkAll?.symbol?.NetworkType) return symbolSdkAll.symbol;
  if (symbolSdkAll?.default?.symbol?.NetworkType) return symbolSdkAll.default.symbol;
  if (symbolSdkAll?.default?.NetworkType) return symbolSdkAll.default;
  if (symbolSdkAll?.NetworkType) return symbolSdkAll;
  return symbolSdkAll.symbol || symbolSdkAll.default || symbolSdkAll;
})();

const getUserAddress = dbModule.getUserAddress || dbModule.default?.getUserAddress;

const MOSAIC_ID = process.env.MOSAIC_ID || '0000000000000000';
const NETWORK_TYPE = symbol.NetworkType ? symbol.NetworkType.TESTNET : 152;
const EPOCH_ADJUSTMENT = 1637256000;
const GENERATION_HASH = '7F741E31A9233E01428D3F8462FC4A08E61966C636758D736F224937748648A1';

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

  async handleSelect(interaction) {},

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('shop_page_')) {
      const targetIndex = parseInt(customId.replace('shop_page_', ''), 10);
      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= ITEMS.length) return;

      const card = renderItemCard(targetIndex);
      return await interaction.update(card);
    }

    if (customId.startsWith('shop_prompt_')) {
      const index = parseInt(customId.replace('shop_prompt_', ''), 10);
      const item = ITEMS[index];

      const confirmEmbed = new EmbedBuilder()
        .setTitle('購入内容の確認')
        .setDescription(`以下の商品を交換しますか？\n\n商品名: ${item.name}\n必要ポイント: ${item.price} pt`)
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

    if (customId.startsWith('shop_exec_')) {
      const index = parseInt(customId.replace('shop_exec_', ''), 10);
      const item = ITEMS[index];

      await interaction.update({ content: '決済処理を行っています...', embeds: [], components: [] });

      try {
        let userAddressRaw = null;

        if (getUserAddress) {
          userAddressRaw = await getUserAddress(interaction.user.id);
        }

        if (!userAddressRaw) {
          return await interaction.editReply({
            content: 'データが見つかりませんでした。'
          });
        }

        const companyAccount = symbol.Account.createFromPrivateKey(
          process.env.COMPANY_PRIVATE_KEY,
          NETWORK_TYPE
        );
        const userAddress = symbol.Address.createFromRawAddress(userAddressRaw);

        const revokeTx = symbol.MosaicSupplyRevocationTransaction.create(
          symbol.Deadline.create(EPOCH_ADJUSTMENT),
          userAddress,
          new symbol.Mosaic(
            new symbol.MosaicId(MOSAIC_ID),
            symbol.UInt64.fromUint(item.price)
          ),
          NETWORK_TYPE
        ).setMaxFee(100);

        companyAccount.sign(revokeTx, GENERATION_HASH);

        const fieldName = item.type === 'url' ? '受取リンク' : '引き渡しコード';
        const fieldValue = item.type === 'url' ? `[ここをクリックして受け取る](${item.code})` : `\`${item.code}\``;

        const successEmbed = new EmbedBuilder()
          .setTitle('交換が完了しました')
          .setDescription(`${item.name} の受け取りが完了しました。`)
          .setImage(item.image)
          .addFields({ name: fieldName, value: fieldValue })
          .setColor(0x00FF00);

        await interaction.editReply({ content: null, embeds: [successEmbed], components: [] });

      } catch (error) {
        console.error('購入処理エラー:', error);
        await interaction.editReply({
          content: 'データの処理中にエラーが発生しました。時間をおいて再度お試しください。'
        });
      }
    }
  }
};
