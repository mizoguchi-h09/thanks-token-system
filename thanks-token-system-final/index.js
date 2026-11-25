import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, MessageFlags } from 'discord.js';
import { handleReactionAdd } from './reactionHandler.js';
import { handleBalanceCommand } from './balanceCommand.js';
import { handleRegisterCommand } from './registerUserCommand.js';
import { handleUnregisterCommand } from './unregisterUserCommand.js';
import shopCmd from './shop_command.js';
import myTicketsCmd from './mytickets_command.js';

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
      } else if (commandName === 'register') {
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
      if (interaction.customId.startsWith('shop_')) {
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
  }
});

client.login(process.env.DISCORD_TOKEN);