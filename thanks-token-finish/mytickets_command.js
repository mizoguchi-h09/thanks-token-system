import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags
} from 'discord.js';
import PocketBase from 'pocketbase';

const POCKETBASE_URL = process.env.POCKETBASE_URL;
const pb = new PocketBase(POCKETBASE_URL);

export default {
  data: new SlashCommandBuilder()
    .setName('mytickets')
    .setDescription('所持している未使用チケットを一覧表示します'),

  /**
   * 1. /mytickets コマンド実行時（一覧 ＋ ドロップダウンメニュー表示）
   */
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await this.showTicketList(interaction);
  },

  /**
   * チケット一覧画面をレンダリングする共通処理
   */
  async showTicketList(interaction) {
    try {
      if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
        await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      }

      // 未使用チケット一覧を取得
      const tickets = await pb.collection('tickets').getFullList({
        filter: `discordId = "${interaction.user.id}" && (status = "unused" || status = "active")`,
        sort: '-created'
      });

      if (tickets.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle('🎫 所持デジタルチケット一覧')
          .setDescription('🎟️ 現在利用できる未使用のチケットはありません。')
          .setColor(0x888888);

        return await interaction.editReply({
          embeds: [emptyEmbed],
          components: []
        });
      }

      // 一覧表示用 Embed
      const listEmbed = new EmbedBuilder()
        .setTitle('🎫 所持デジタルチケット一覧')
        .setDescription(`現在 **${tickets.length} 枚** の未使用チケットを保有しています。\n\n下のメニューから使用したいチケットを選択してください。`)
        .setColor(0x5865F2);

      tickets.forEach((ticket, index) => {
        const displayTicketId = ticket.ticketId || ticket.id;
        listEmbed.addFields({
          name: `${index + 1}.${ticket.itemName}`,
          value: `ID: \`${displayTicketId}\``,
          inline: false
        });
      });

      // ドロップダウンメニューの生成（最大25枚まで対応）
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('myticket_select')
        .setPlaceholder('🎟️ 表示するチケットを選択してください...')
        .addOptions(
          tickets.slice(0, 25).map((ticket, index) => {
            const displayTicketId = ticket.ticketId || ticket.id;
            return new StringSelectMenuOptionBuilder()
              .setLabel(`${index + 1}.${ticket.itemName}`)
              .setDescription(`ID: ${displayTicketId}`)
              .setValue(ticket.id); // 主キーで即時取得するため value は ticket.id
          })
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.editReply({
        embeds: [listEmbed],
        components: [row]
      });

    } catch (error) {
      console.error('MyTickets 一覧エラー:', error);
      await interaction.editReply({
        content: `❌ チケット情報の取得に失敗しました。（エラー: ${error.message || '不明なエラー'}）`
      });
    }
  },

  /**
   * 2. ドロップダウンメニューでチケットを選択した時の処理
   */
  async handleSelectMenu(interaction) {
    await interaction.deferUpdate();

    try {
      if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
        await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      }

      const selectedTicketId = interaction.values[0];

      // 選択されたチケットの情報を主キーで取得
      const ticket = await pb.collection('tickets').getOne(selectedTicketId);

      if (ticket.status === 'used') {
        return await interaction.followUp({
          content: '⚠️ このチケットはすでに使用済みです。',
          flags: MessageFlags.Ephemeral
        });
      }

      const displayTicketId = ticket.ticketId || ticket.id;

      // 単体チケット表示 Embed
      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 デジタル引換チケット')
        .setDescription(`**【 ${ticket.itemName} 】**\n\nスタッフに見せて、下の「使用する」ボタンを押してください。`)
        .addFields(
          { name: '所有者', value: `\`${ticket.userName || interaction.user.displayName}\``, inline: true },
          { name: 'ステータス', value: ' **未使用**', inline: true },
          { name: 'チケットID', value: `\`${displayTicketId}\``, inline: true }
        )
        .setColor(0x22C55E)
        .setFooter({ text: '※スタッフの目の前でボタンを押してください' });

      // 使用する（消し込み）ボタン：shop_command.js 側のハンドラ用にカスタムID (TKT-...) をセット
      const useBtn = new ButtonBuilder()
        .setCustomId(`shop_useticket_${displayTicketId}`)
        .setLabel('タップして使用')
        .setStyle(ButtonStyle.Danger);

      // 一覧に戻るボタン
      const backBtn = new ButtonBuilder()
        .setCustomId('myticket_back')
        .setLabel('↩️ 一覧に戻る')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(useBtn, backBtn);

      await interaction.editReply({
        embeds: [ticketEmbed],
        components: [row]
      });

    } catch (error) {
      console.error('チケット詳細表示エラー:', error);
      await interaction.followUp({
        content: '❌ チケット情報の表示に失敗しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  },

  /**
   * 3. 「一覧に戻る」ボタン等の処理
   */
  async handleButton(interaction) {
    if (interaction.customId === 'myticket_back') {
      await interaction.deferUpdate();
      await this.showTicketList(interaction);
    }
  }
};