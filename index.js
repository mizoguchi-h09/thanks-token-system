require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

// Botが起動したときの処理
client.once("clientReady", async () => {
  console.log(`${client.user.tag} 起動成功！`);

  try {
    const channel = client.channels.cache.find(
      ch => ch.name === "一般" && ch.isTextBased()
    );

    if (channel) {
      await channel.send("こんにちは！Botが起動しました");
      console.log(`「${channel.name}」チャンネルにメッセージを送信しました。`);
    } else {
      console.log("「一般」という名前のチャンネルが見つかりませんでした。");
    }
  } catch (error) {
    console.error("メッセージの送信中にエラーが発生しました:", error.message);
  }
});

// リアクション検知
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('メッセージデータの取得に失敗しました:', error);
      return;
    }
  }

  const messageAuthor = reaction.message.author;
  if (!messageAuthor) return;


  console.log(`[リアクション検知] ${user.username} が ${messageAuthor.username} に 「${reaction.emoji.name}」 をつけました`);
});

client.login(process.env.TOKEN);
