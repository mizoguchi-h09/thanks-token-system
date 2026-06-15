import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`${client.user?.tag} が起動しました`);
});

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  console.log(
    `${user.username} が ${reaction.emoji.name} を付けました`
  );
});

client.login(process.env.DISCORD_TOKEN);