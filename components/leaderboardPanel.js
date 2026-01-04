const { EmbedBuilder } = require("discord.js");
const PlayerStats = require("../models/PlayerStats");

const LEADERBOARD_CHANNEL_ID = "1427043072252051466";
const PANEL_TITLE = "🏆 SKIRMISH LEADERBOARD";

// Medal emojis for top 3
const medals = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

/**
 * Build the flashy leaderboard embed
 */
async function buildLeaderboardEmbed(guild) {
  const serverId = guild.id;

  // Get top 7 by weekly earnings
  const topWeekly = await PlayerStats.find({ serverId })
    .sort({ weeklyEarnings: -1 })
    .limit(7)
    .lean();

  // Get top 7 by lifetime earnings
  const topEarnings = await PlayerStats.find({ serverId })
    .sort({ lifetimeEarnings: -1 })
    .limit(7)
    .lean();

  // Build the embed
  const embed = new EmbedBuilder()
    .setTitle("🏆 **SKIRMISH LEADERBOARD** 🏆")
    .setDescription(
      "┌─────────────────────────────────────┐\n" +
        "│  **TOP PLAYERS**  •  *Live Rankings*  │\n" +
        "└─────────────────────────────────────┘"
    )
    .setColor(0xffd700) // Gold color
    .setTimestamp(new Date())
    .setFooter({
      text: "🔥 Updated live • Weekly stats reset every Monday",
    });

  // Top Weekly Winners Field
  if (topWeekly.length > 0) {
    let weeklyText = "";
    for (let i = 0; i < Math.min(7, topWeekly.length); i++) {
      const stat = topWeekly[i];
      const member = await guild.members.fetch(stat.userId).catch(() => null);
      const name = member
        ? member.displayName.slice(0, 20)
        : `User ${stat.userId.slice(0, 8)}`;

      const medal = medals[i + 1] || `\`${i + 1}.\``;
      const weeklyEarnings = stat.weeklyEarnings || 0;

      weeklyText += `${medal} **${name}**\n`;
      weeklyText += `   └ $${weeklyEarnings.toFixed(2)} this week`;
      if (stat.currentStreak > 2) {
        weeklyText += ` • 🔥${stat.currentStreak}`;
      }
      weeklyText += "\n";
    }

    embed.addFields({
      name: "📅 **TOP WEEKLY WINNERS**",
      value: weeklyText || "No data yet",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "📅 **TOP WEEKLY WINNERS**",
      value: "No winners yet this week. Be the first to compete!",
      inline: false,
    });
  }

  // Separator
  embed.addFields({
    name: "\u200b",
    value: "━━━━━━━━━━━━━━━━━━━━━━━━━",
    inline: false,
  });

  // Top Earners Field
  if (topEarnings.length > 0) {
    let earningsText = "";
    for (let i = 0; i < Math.min(7, topEarnings.length); i++) {
      const stat = topEarnings[i];
      const member = await guild.members.fetch(stat.userId).catch(() => null);
      const name = member
        ? member.displayName.slice(0, 20)
        : `User ${stat.userId.slice(0, 8)}`;

      const medal = medals[i + 1] || `\`${i + 1}.\``;
      const totalWins = stat.totalWins || 0;

      earningsText += `${medal} **${name}**\n`;
      earningsText += `   └ $${stat.lifetimeEarnings.toFixed(
        2
      )} earned • ${totalWins} wins\n`;
    }

    embed.addFields({
      name: "💰 **TOP EARNERS**",
      value: earningsText || "No data yet",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "💰 **TOP EARNERS**",
      value: "No winners yet. Start competing to earn prizes!",
      inline: false,
    });
  }

  // Stats Summary
  const totalPlayers = await PlayerStats.countDocuments({ serverId });
  const totalTournaments = await PlayerStats.aggregate([
    { $match: { serverId } },
    { $group: { _id: null, total: { $sum: "$tournamentsPlayed" } } },
  ]);
  const totalPrizePool = await PlayerStats.aggregate([
    { $match: { serverId } },
    { $group: { _id: null, total: { $sum: "$lifetimeEarnings" } } },
  ]);

  const tourneysPlayed = totalTournaments[0]?.total || 0;
  const totalPaid = totalPrizePool[0]?.total || 0;

  embed.addFields({
    name: "\u200b",
    value:
      `📊 **Community Stats**\n` +
      `└ ${totalPlayers} Players • ${tourneysPlayed} Tournaments • $${totalPaid.toFixed(
        2
      )} Paid Out`,
    inline: false,
  });

  return embed;
}

/**
 * Ensure leaderboard panel exists and update it
 */
async function ensureLeaderboardPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(LEADERBOARD_CHANNEL_ID);

    const embed = await buildLeaderboardEmbed(guild);

    // Try to find existing panel
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("LEADERBOARD")
    );

    if (existing) {
      await existing.edit({ embeds: [embed] });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Failed to update leaderboard:", err);
  }
}

/**
 * Update leaderboard (call this after matches/tournaments end)
 */
async function refreshLeaderboard(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(LEADERBOARD_CHANNEL_ID);
    const embed = await buildLeaderboardEmbed(guild);

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("LEADERBOARD")
    );

    if (existing) {
      await existing.edit({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Failed to refresh leaderboard:", err);
  }
}

module.exports = {
  ensureLeaderboardPanel,
  refreshLeaderboard,
};
