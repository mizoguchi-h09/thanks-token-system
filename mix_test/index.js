require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");

const PocketBase = require("pocketbase").default;
const pb = new PocketBase("http://127.0.0.1:8090");

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

//トークンのリアクション
const tokenRewards = {
  "100": 100,
  "50": 50,
  "10": 10,
  "5_": 5,
  "1_": 1
};

// リアクション処理
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      return console.error(err);
    }
  }

  const messageAuthor = reaction.message.author;
  if (!messageAuthor) return;

  if (user.id === messageAuthor.id) return;

  const emoji = reaction.emoji.name;
  const reward = tokenRewards[emoji];

  try {
    // 投稿者取得（なければ作成）
    let receiver;

    try {
      receiver = await pb
        .collection("discode_users")
        .getFirstListItem(`discordId="${messageAuthor.id}"`);
    } catch {
      receiver = await pb.collection("discode_users").create({
        discordId: messageAuthor.id,
        username: messageAuthor.username,
        balance: 0
      });
    }

    // balance更新
    const newBalance = (receiver.balance || 0) + (reward || 0);

    await pb.collection("discode_users").update(receiver.id, {
      balance: newBalance
    });

    //ログ保存
    await pb.collection("token_logs").create({
      senderId: user.id,
      receiverId: receiver.id,
      messageId: reaction.message.id,
      emoji,
      amount: reward || 0
    });

    // ログ
    console.log(
      `${user.username} が ${messageAuthor.username} に 「${emoji}」`
    );

    if (reward) {
      console.log(`→ ${reward}トークン付与（合計: ${newBalance}）`);
    }

  } catch (err) {
    console.error("エラー:", err.message);
  }
});

client.login(process.env.TOKEN);

