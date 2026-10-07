//コマンドの登録用js

import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('あなたの保有トークン（Give / Point）の残高を確認します'),
  
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('感謝トークンシステムにアカウントを新規登録します'),

  new SlashCommandBuilder()
    .setName('unregister')
    .setDescription('感謝トークンシステムから登録解除（アカウント削除）します'),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('ECサイトを表示します'),

  new SlashCommandBuilder()
    .setName('mytickets')
    .setDescription('所持している未使用のデジタルチケットを一覧表示します'),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔄 スラッシュコマンドを更新中...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log('✅ コマンドの登録が完了しました！');
  } catch (error) {
    console.error('❌ 登録エラー:', error);
  }
})();