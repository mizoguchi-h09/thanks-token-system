import { EmbedBuilder, MessageFlags } from 'discord.js';
import PocketBase from 'pocketbase';
import { SymbolFacade } from 'symbol-sdk/symbol';
import { PrivateKey } from 'symbol-sdk';

const pb = new PocketBase(process.env.POCKETBASE_URL);

/**
 * ユーザー用の受取専用 Symbol アドレスを生成する
 */
function generateUserAddress() {
  const networkName = process.env.SYMBOL_NETWORK_TYPE === 'MAIN_NET' ? 'mainnet' : 'testnet';
  
  const facade = new SymbolFacade(networkName);
  const tempPrivateKey = PrivateKey.random();
  const tempKeyPair = new SymbolFacade.KeyPair(tempPrivateKey);
  const address = facade.network.publicKeyToAddress(tempKeyPair.publicKey);

  return address.toString();
}

export async function handleRegisterCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordId = interaction.user.id;
  const username = interaction.user.username;

  try {
    // 1. PocketBase 管理者ログイン（試行するが失敗しても処理を継続できる保護を追加）
    if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      ).catch(adminErr => {
        console.warn('⚠️ Adminログイン失敗（API Rulesが開放されていれば動作します）:', adminErr.message);
      });
    }

    // 2. 重複登録チェック
    const existingRecord = await pb.collection('discord_users')
      .getFirstListItem(`discordId="${discordId}"`)
      .catch(() => null);

    if (existingRecord) {
      return await interaction.editReply({
        content: `⚠️ **${username}** さんは既に登録されています！\nSymbol Address: \`${existingRecord.symbolAddress}\``
      });
    }

    // 3. ユーザー用の受取専用 Symbol アドレスを生成
    const userSymbolAddress = generateUserAddress();

    // 4. PocketBase に保存
    await pb.collection('discord_users').create({
      discordId: discordId,
      username: username,
      symbolAddress: userSymbolAddress,
      give_balance: 0,
      point_balance: 0
    });

    // 5. 完了 Embed 通知
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('ユーザー登録が完了しました！')
      .setDescription('感謝トークンシステムにあなたのアカウントを登録しました。')
      .addFields(
        { name: 'Discord ユーザー', value: username, inline: true },
        { name: '受取用 Symbol アドレス', value: `\`${userSymbolAddress}\``, inline: false }
      )
      .setFooter({ text: '※すべてのトランザクション署名は組織管理鍵によって行われます' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ 新規登録完了: ${username} (Addr:${userSymbolAddress})`);

  } catch (err) {
    // 詳細なエラーレスポンスを出力
    console.error('❌ ユーザー登録処理エラー詳細:', err.status, err.data || err);

    await interaction.editReply({
      content: `❌ ユーザー登録処理中にエラーが発生しました。\n\`${err.data?.message || err.message}\``
    });
  }
}