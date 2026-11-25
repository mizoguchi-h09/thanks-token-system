import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
  AttachmentBuilder
} from 'discord.js';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';
import { executePointRevocation } from './shop_transaction.js';

const POCKETBASE_URL = process.env.POCKETBASE_URL;
const SYMBOL_NODE = process.env.SYMBOL_NODE;
const SYMBOL_PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY;
const MOSAIC_ID_TICKET_DRINK = process.env.MOSAIC_ID_TICKET_DRINK;
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID;

const pb = new PocketBase(POCKETBASE_URL);

// ローカル画像を保存するフォルダ（プロジェクト直下の images フォルダ）
const IMAGES_DIR = path.resolve('./images');

async function ensureAdminAuth() {
  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    try {
      if (pb.admins) {
        await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      } else {
        await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      }
    } catch (err) {
      console.warn('⚠️ PB 管理者認証スキップ:', err.message);
    }
  }
}

const ITEMS = [
  {
    id: 'item_cola_150',
    name: 'コカコーラ',
    price: 150,
    code: 'TICKET_DRINK_REAL',
    image: 'cola.png',
    description: 'ドリンク1本と引き換えできるデジタルチケットです。',
    type: 'ticket'
  },
  {
    id: 'item_water_100',
    name: '水',
    price: 100,
    code: 'TICKET_DRINK_REAL',
    image: 'water.jpg',
    description: 'ドリンク1本と引き換えできるデジタルチケットです。',
    type: 'ticket'
  },
  {
    id: 'item_tea_130',
    name: 'お茶(緑茶)',
    price: 130,
    code: 'TICKET_DRINK_REAL',
    image: 'tea.jpg',
    description: 'ドリンク1本と引き換えできるデジタルチケットです。',
    type: 'ticket'
  },
  {
    id: 'item_jagariko_200',
    name: 'じゃがりこ(サラダ)',
    price: 200,
    code: 'TICKET_DRINK_REAL',
    image: 'jagariko.png',
    description: 'じゃがりこ(サラダ)と引き換えできるデジタルチケットです。',
    type: 'ticket'
  },
  {
    id: 'item_picola_200',
    name: 'ピコラ(チョコ菓子)',
    price: 180,
    code: 'TICKET_DRINK_REAL',
    image: 'picola.png',
    description: 'ピコラ(チョコ菓子)と引き換えできるデジタルチケットです。',
    type: 'ticket'
  },
  {
    id: 'item_fettuccine_200',
    name: 'フェットチーネグミ(グレープ)',
    price: 180,
    code: 'TICKET_DRINK_REAL',
    image: 'fettuccine.png',
    description: 'フェットチーネグミ(グレープ)と引き換えできるデジタルチケットです。',
    type: 'ticket'
  }
];

function createImageAttachment(fileName) {
  const filePath = path.join(IMAGES_DIR, fileName);
  return new AttachmentBuilder(filePath, { name: fileName });
}

async function getUserPointBalance(discordId) {
  try {
    await ensureAdminAuth();
    const userList = await pb.collection('discord_users').getList(1, 1, {
      filter: `discordId="${discordId}"`
    });
    return userList.items.length > 0 ? (userList.items[0].point_balance || 0) : 0;
  } catch (err) {
    console.warn(`⚠️ 残高取得失敗 (DiscordId: ${discordId}):`, err.message);
    return 0;
  }
}

function renderItemCard(index, pointBalance = 0) {
  const item = ITEMS[index];
  const total = ITEMS.length;
  const attachment = createImageAttachment(item.image);

  const embed = new EmbedBuilder()
    .setTitle(`ポイントショップ (${index + 1}/${total})`)
    .setDescription(
      `💰 **現在の保有ポイント**: \`${pointBalance} pt\`\n\n` +
      `### ${item.name}\n` +
      `必要ポイント: \`${item.price} pt\`\n\n` +
      `${item.description}`
    )
    .setImage(`attachment://${item.image}`)
    .setColor(pointBalance >= item.price ? 0x5865F2 : 0x94A3B8)
    .setFooter({ text: 'ドロップダウンまたは 前へ / 次へ ボタンで商品を選択できます' });

  // 1. 商品選択ドロップダウンメニュー（絵文字なし）
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('shop_select_item')
    .setPlaceholder('商品を選択してください...')
    .addOptions(
      ITEMS.map((it, idx) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${it.name} (${it.price} pt)`)
          .setDescription(it.description.slice(0, 100))
          .setValue(String(idx))
          .setDefault(idx === index)
      )
    );

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  // 2. 操作ボタン（前へ / 交換する / 次へ）
  const prevBtn = new ButtonBuilder()
    .setCustomId(`shop_page_${index - 1}`)
    .setLabel('前へ')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(index === 0);

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

  const buttonRow = new ActionRowBuilder().addComponents(prevBtn, buyBtn, nextBtn);

  return { embeds: [embed], components: [selectRow, buttonRow], files: [attachment] };
}

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('ポイントショップを開きます'),

  async execute(interaction) {
    const balance = await getUserPointBalance(interaction.user.id);
    const card = renderItemCard(0, balance);
    await interaction.reply({ ...card, flags: MessageFlags.Ephemeral });
  },

  // ドロップダウン選択時の処理
  async handleSelectMenu(interaction) {
    if (interaction.customId === 'shop_select_item') {
      const targetIndex = parseInt(interaction.values[0], 10);
      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= ITEMS.length) return;

      const balance = await getUserPointBalance(interaction.user.id);
      const card = renderItemCard(targetIndex, balance);
      return await interaction.update(card);
    }
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('shop_page_')) {
      const targetIndex = parseInt(customId.replace('shop_page_', ''), 10);
      if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= ITEMS.length) return;

      const balance = await getUserPointBalance(interaction.user.id);
      const card = renderItemCard(targetIndex, balance);
      return await interaction.update(card);
    }

    if (customId.startsWith('shop_prompt_')) {
      const index = parseInt(customId.replace('shop_prompt_', ''), 10);
      const item = ITEMS[index];
      const balance = await getUserPointBalance(interaction.user.id);
      const attachment = createImageAttachment(item.image);

      const confirmEmbed = new EmbedBuilder()
        .setTitle('購入内容の確認')
        .setDescription(
          `以下の商品を交換しますか？\n\n` +
          `商品名: **${item.name}**\n` +
          `必要ポイント: **${item.price} pt**\n` +
          `現在の所持ポイント: **${balance} pt** ➔ 交換後: **${balance - item.price} pt**`
        )
        .setImage(`attachment://${item.image}`)
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
      return await interaction.update({ embeds: [confirmEmbed], components: [row], files: [attachment] });
    }

    if (customId.startsWith('shop_exec_')) {
      await interaction.update({ 
        content: '⏳ 決済およびブロックチェーン処理を行っています...しばらくお待ちください。', 
        embeds: [], 
        components: [],
        files: []
      });

      const index = parseInt(customId.replace('shop_exec_', ''), 10);
      const item = ITEMS[index];
      const userName = interaction.user.displayName || interaction.user.username;

      const result = await executePointRevocation(interaction.user.id, item, userName);

      if (!result.success) {
        return await interaction.editReply({ content: result.error });
      }

      // ★ 管理者向けシンプルログ送信
      if (ADMIN_CHANNEL_ID) {
        try {
          const adminChannel = await interaction.client.channels.fetch(ADMIN_CHANNEL_ID);
          if (adminChannel) {
            const logDetail = result.ticketId ? `${item.code} (ID: ${result.ticketId})` : item.code;
            const adminLogEmbed = new EmbedBuilder()
              .setTitle('商品交換ログ')
              .setColor(0x34495E)
              .addFields(
                { name: 'ユーザー', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: '商品名', value: item.name, inline: true },
                { name: '消費ポイント', value: `${item.price} pt`, inline: true },
                { name: '決済後残高', value: `${result.newBalance} pt`, inline: true },
                { name: 'コード / URL', value: logDetail, inline: false }
              )
              .setTimestamp();

            await adminChannel.send({ embeds: [adminLogEmbed] });
          }
        } catch (logErr) {
          console.error('管理チャンネルへのログ送信エラー:', logErr);
        }
      }

      const attachment = createImageAttachment(item.image);

      if (item.type === 'ticket' && result.ticketId) {
        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 デジタル引換チケット')
          .setDescription(`**【 ${item.name} 】**\n\nスタッフに見せて、下の「使用する」ボタンを押してください。`)
          .setImage(`attachment://${item.image}`)
          .addFields(
            { name: '所有者', value: `\`${userName}\``, inline: true },
            { name: 'ステータス', value: '🟢 **未使用 (有効)**', inline: true },
            { name: 'チケットID', value: `\`${result.ticketId}\``, inline: true },
            { name: '現在のポイント残高', value: `${result.newBalance} pt`, inline: false }
          )
          .setColor(0x22C55E)
          .setFooter({ text: '※スタッフの目の前でボタンを押してください（Symbolモザイクが回収されます）' })
          .setTimestamp();

        const useBtn = new ButtonBuilder()
          .setCustomId(`shop_useticket_${result.ticketId}`)
          .setLabel('タップして使用')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(useBtn);

        return await interaction.editReply({
          content: '🎉 **交換が完了しました！**',
          embeds: [ticketEmbed],
          components: [row],
          files: [attachment]
        });
      }

      const fieldName = item.type === 'url' ? '受取リンク' : '引き渡しコード';
      const fieldValue = item.type === 'url' ? `[ここをクリックして受け取る](${item.code})` : `\`${item.code}\``;

      const successEmbed = new EmbedBuilder()
        .setTitle('🎉 交換が完了しました')
        .setDescription(`**${item.name}** の受け取りが完了しました。`)
        .setImage(`attachment://${item.image}`)
        .addFields(
          { name: '所有者', value: `\`${userName}\``, inline: true },
          { name: fieldName, value: fieldValue, inline: false },
          { name: '残高', value: `${result.newBalance} pt`, inline: true }
        )
        .setColor(0x00FF00);

      return await interaction.editReply({ content: null, embeds: [successEmbed], components: [], files: [attachment] });
    }

    // 4. 【消し込み処理】「タップして使用」ボタン押下時
    if (customId.startsWith('shop_useticket_')) {
      await interaction.deferUpdate();

      const customTicketId = customId.replace('shop_useticket_', '');

      try {
        await ensureAdminAuth();

        // 1. チケット情報の取得 (filter クエリを使わず全取得して JS 側で判定)
        const allTickets = await pb.collection('tickets').getFullList();

        if (allTickets.length > 0) {
          console.log('🔍 PB tickets レコードの実際のフィールド名一覧:', Object.keys(allTickets[0]));
        }

        // ticketId, ticketld, id のいずれかに一致するレコードを検索
        const ticket = allTickets.find(t => 
          t.ticketId === customTicketId || 
          t.ticketld === customTicketId || 
          t.id === customTicketId
        );

        if (!ticket) {
          console.error(`⚠️ チケットが見つかりません: customTicketId="${customTicketId}"`);
          return await interaction.followUp({
            content: `❌ チケット情報（ID: ${customTicketId}）が DB に存在しません。`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (ticket.status === 'used') {
          return await interaction.followUp({
            content: '⚠️ このチケットはすでに使用済みです。',
            flags: MessageFlags.Ephemeral
          });
        }

        // 所有者の Discord ID を特定
        const targetDiscordId = ticket.discordId || ticket.discordld || ticket.userId || interaction.user.id;

        // 2. ユーザー情報の取得 (全取得して JS 側で判定)
        const allUsers = await pb.collection('discord_users').getFullList();
        const userRecord = allUsers.find(u => u.discordId === targetDiscordId || u.discordld === targetDiscordId);

        if (!userRecord) {
          return await interaction.followUp({
            content: `❌ ユーザー情報（Discord ID: ${targetDiscordId}）が DB に存在しません。`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (!userRecord.symbolAddress) {
          return await interaction.followUp({
            content: '❌ ユーザーの Symbol アドレスが登録されていません。',
            flags: MessageFlags.Ephemeral
          });
        }

        const cleanAddrStr = userRecord.symbolAddress.replace(/-/g, '').trim().toUpperCase();

        // 3. Symbol ブロックチェーン上でのチケット回収 ＆ オンチェーンログ刻印 (Aggregate Tx)
        const facade = new SymbolFacade('testnet');
        const adminKeyPair = new KeyPair(new PrivateKey(SYMBOL_PRIVATE_KEY.trim()));
        const targetAddress = new Address(cleanAddrStr);

        const mosaicIdHex = (MOSAIC_ID_TICKET_DRINK || '').replace(/^0x/i, '').padStart(16, '0').toLowerCase();
        const ticketMosaicId = BigInt(`0x${mosaicIdHex}`);

        // 内部Tx1: モザイク回収
        const innerRevokeTx = facade.transactionFactory.createEmbedded({
          type: 'mosaic_supply_revocation_transaction_v1',
          signerPublicKey: adminKeyPair.publicKey,
          sourceAddress: targetAddress,
          mosaic: {
            mosaicId: ticketMosaicId,
            amount: 1n
          }
        });

        // 内部Tx2: 使用ログのメッセージ送信 (TICKET_USE:TKT-xxx)
        const innerMessageTx = facade.transactionFactory.createEmbedded({
          type: 'transfer_transaction_v1',
          signerPublicKey: adminKeyPair.publicKey,
          recipientAddress: targetAddress,
          mosaics: [],
          message: new Uint8Array([0x00, ...Buffer.from(`TICKET_USE:${customTicketId}`)])
        });

        const innerTransactions = [innerRevokeTx, innerMessageTx];
        const merkleHash = facade.static.hashEmbeddedTransactions(innerTransactions);

        const aggregateTx = facade.transactionFactory.create({
          type: 'aggregate_complete_transaction_v3',
          signerPublicKey: adminKeyPair.publicKey,
          fee: 0n,
          deadline: facade.now().addSeconds(7200).timestamp,
          transactionsHash: merkleHash,
          transactions: innerTransactions
        });

        aggregateTx.fee.value = BigInt(aggregateTx.size * 200);

        const signature = facade.signTransaction(adminKeyPair, aggregateTx);
        const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);

        const announceRes = await fetch(`${SYMBOL_NODE}/transactions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson
        });

        const announceResult = await announceRes.json();
        console.log('🎫 チケットモザイク回収 Aggregate Tx 結果:', announceResult);

        // 4. PocketBase のステータス更新
        await pb.collection('tickets').update(ticket.id, {
          status: 'used',
          usedAt: new Date().toISOString()
        });

        const usedEmbed = new EmbedBuilder()
          .setTitle('🔴 デジタル引換チケット (使用済み)')
          .setDescription(`**【 ${ticket.itemName} 】**\n\nこのチケットは使用が完了しました（Symbolモザイク回収完了）。`)
          .addFields(
            { name: '所有者', value: `\`${ticket.userName || interaction.user.username}\``, inline: true },
            { name: 'ステータス', value: '🔴 **利用済み (無効)**', inline: true },
            { name: 'チケットID', value: `\`${ticket.ticketId || ticket.ticketld || ticket.id}\``, inline: true }
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
          content: '✅ **引き換えが完了しました！（オンチェーン回収完了）**',
          embeds: [usedEmbed],
          components: [row],
          files: []
        });

      } catch (error) {
        console.error('チケット消し込みエラー:', error);
        if (error.data) {
          console.error('🔍 PB エラー詳細:', JSON.stringify(error.data, null, 2));
        }
        await interaction.followUp({
          content: `❌ 処理中にエラーが発生しました: ${error.message}`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};