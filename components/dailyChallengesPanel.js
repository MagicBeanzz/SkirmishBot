const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const DailyChallenges = require("../models/DailyChallenges");
const Profile = require("../models/profileSchema");

const CHALLENGES_CHANNEL_ID = "1457540770750922783";
const PANEL_TITLE = "🎯 Daily Challenges";

/**
 * Generate daily challenges (resets every 24 hours)
 */
function generateDailyChallenges() {
  return {
    easy: {
      id: "play_any_3",
      title: "Warm Up",
      description: "Play 3 matches in any tier",
      reward: 3,
      requirement: 3,
      tierRequired: null,
    },
    medium: {
      id: "win_mm10_2",
      title: "Step It Up",
      description: "Win 2 matches in MM10 or higher",
      reward: 5,
      requirement: 2,
      tierRequired: ["MM10", "MM20", "MM50"],
    },
    hard: {
      id: "win_mm20_3",
      title: "High Roller",
      description: "Win 3 matches in MM20 or MM50",
      reward: 10,
      requirement: 3,
      tierRequired: ["MM20", "MM50"],
    },
    elite: {
      id: "win_mm50_1",
      title: "Elite Champion",
      description: "Win 1 match in MM50 tier",
      reward: 15,
      requirement: 1,
      tierRequired: ["MM50"],
    },
  };
}

/**
 * Build daily challenges embed
 */
async function buildDailyChallengesEmbed(guild) {
  const serverId = guild.id;
  const challenges = generateDailyChallenges();

  // Calculate time until reset (midnight UTC)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const hoursUntilReset = Math.floor((tomorrow - now) / (1000 * 60 * 60));
  const minutesUntilReset = Math.floor(((tomorrow - now) % (1000 * 60 * 60)) / (1000 * 60));

  const embed = new EmbedBuilder()
    .setTitle("🎯 **DAILY CHALLENGES** 🎯")
    .setDescription(
      "Complete challenges to earn bonus tickets! Challenges reset daily.\n\n" +
      `⏰ Resets in: **${hoursUntilReset}h ${minutesUntilReset}m**\n\n` +
      "━━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setColor(0xff6b35)
    .setTimestamp(new Date())
    .setFooter({ text: "Play higher tiers for better rewards!" });

  // Add each challenge
  embed.addFields(
    {
      name: "🟢 " + challenges.easy.title,
      value:
        `${challenges.easy.description}\n` +
        `**Reward:** ${challenges.easy.reward} tickets 🎫`,
      inline: false,
    },
    {
      name: "🟡 " + challenges.medium.title,
      value:
        `${challenges.medium.description}\n` +
        `**Reward:** ${challenges.medium.reward} tickets 🎫`,
      inline: false,
    },
    {
      name: "🔴 " + challenges.hard.title,
      value:
        `${challenges.hard.description}\n` +
        `**Reward:** ${challenges.hard.reward} tickets 🎫`,
      inline: false,
    },
    {
      name: "💎 " + challenges.elite.title,
      value:
        `${challenges.elite.description}\n` +
        `**Reward:** ${challenges.elite.reward} tickets 🎫`,
      inline: false,
    }
  );

  embed.addFields({
    name: "\u200b",
    value: "Click 'My Progress' to check your daily challenge progress!",
    inline: false,
  });

  return embed;
}

/**
 * Build buttons for the panel
 */
function buildChallengeButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("CHECK_DAILY_PROGRESS")
        .setLabel("📊 My Progress")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("CLAIM_DAILY_REWARDS")
        .setLabel("🎁 Claim Rewards")
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

/**
 * Ensure the daily challenges panel exists
 */
async function ensureDailyChallengesPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(CHALLENGES_CHANNEL_ID);

    const embed = await buildDailyChallengesEmbed(guild);
    const components = buildChallengeButtons();

    // Try to find existing panel
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0].title?.includes("DAILY CHALLENGES")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components });
      console.log("✅ Daily challenges panel updated");
    } else {
      await channel.send({ embeds: [embed], components });
      console.log("✅ Daily challenges panel created");
    }
  } catch (err) {
    console.error("❌ Error ensuring daily challenges panel:", err);
  }
}

/**
 * Refresh the daily challenges panel
 */
async function refreshDailyChallengesPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(CHALLENGES_CHANNEL_ID);

    const embed = await buildDailyChallengesEmbed(guild);
    const components = buildChallengeButtons();

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.length > 0 &&
        m.embeds[0].title?.includes("DAILY CHALLENGES")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components });
    }
  } catch (err) {
    console.error("❌ Error refreshing daily challenges panel:", err);
  }
}

module.exports = {
  ensureDailyChallengesPanel,
  refreshDailyChallengesPanel,
  generateDailyChallenges,
};
