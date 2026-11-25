import 'dotenv/config';
import dns from 'node:dns';
import { Client, GatewayIntentBits, Partials, MessageFlags } from 'discord.js';
import { handleReactionAdd } from './reactionHandler.js';
import { handleBalanceCommand } from './balanceCommand.js';
import { handleRegisterCommand } from './registerUserCommand.js';
import { handleUnregisterCommand } from './unregisterUserCommand.js';
import shopCmd from './shop_command.js';
import myTicketsCmd from './mytickets_command.js';

// IPv6 待機による接続タイムアウトを防止
dns.setDefaultResultOrder('ipv4first');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

function getAllowedChannelIds() {
  return (process.env.ALLOWED_CHANNEL_ID || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

client.once('clientReady', async () => {
  console.log(`🤖 ${client.user.tag} 起動成功！`);

  const ownerId = (process.env.BOT_OWNER_DISCORD_ID || '').trim();
  if (!ownerId) {
    console.warn('⚠️ BOT_OWNER_DISCORD_ID が未設定のため、起動通知DMをスキップしました。');
    return;
  }

  try {
    const ownerUser = await client.users.fetch(ownerId);
    await ownerUser.send('🟢 botが起動しました');
    console.log('📩 オーナーへ起動通知DMを送信しました');
  } catch (err) {
    console.error('❌ 起動通知DMの送信に失敗しました:', err.message);
  }
});

// 1. リアクション処理
client.on('messageReactionAdd', (reaction, user) => {
  const allowedChannelIds = getAllowedChannelIds();

  if (allowedChannelIds.length > 0 && !allowedChannelIds.includes(reaction.message.channelId)) {
    return;
  }

  handleReactionAdd(reaction, user);
});

// 2. コマンド・ボタン・セレクトメニュー処理
client.on('interactionCreate', async (interaction) => {
  const allowedChannelIds = getAllowedChannelIds();

  if (allowedChannelIds.length > 0 && !allowedChannelIds.includes(interaction.channelId)) {
    if (interaction.isRepliable()) {
      const channelMentions = allowedChannelIds.map(id => `<#${id}>`).join(' または ');
      await interaction.reply({
        content: `この操作は ${channelMentions} でのみ利用できます。`,
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }

  try {
    // 1. スラッシュコマンド処理
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'balance') {
        await handleBalanceCommand(interaction);
      } else if (commandName === 'token_register') {
        await handleRegisterCommand(interaction);
      } else if (commandName === 'unregister') {
        await handleUnregisterCommand(interaction);
      } else if (commandName === 'shop') {
        await shopCmd.execute(interaction);
      } else if (commandName === 'mytickets') {
        await myTicketsCmd.execute(interaction);
      }
    }
    // 2. ボタン処理
    else if (interaction.isButton()) {
      if (interaction.customId.startsWith('shop_') || interaction.customId.startsWith('disabled_')) {
        await shopCmd.handleButton(interaction);
      } else if (interaction.customId.startsWith('myticket_')) {
        await myTicketsCmd.handleButton(interaction);
      }
    }
    // 3. ドロップダウン（セレクトメニュー）処理
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('shop_')) {
        await shopCmd.handleSelectMenu(interaction);
      } else if (interaction.customId.startsWith('myticket_')) {
        await myTicketsCmd.handleSelectMenu(interaction);
      }
    }
  } catch (error) {
    console.error('Interaction 処理エラー:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ 処理中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);