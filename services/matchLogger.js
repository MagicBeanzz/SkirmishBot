const { EmbedBuilder } = require("discord.js");

const MATCH_LOG_CHANNEL_ID = "1457478737443426416";

/**
 * Log a 1v1 matchmaking match result
 */
async function logMatchmakingResult(client, match, winnerId, tier) {
  try {
    const guild = client.guilds.cache.get(match.serverId);
    if (!guild) return;

    const channel = await guild.channels.fetch(MATCH_LOG_CHANNEL_ID);
    if (!channel) {
      console.error("Match log channel not found");
      return;
    }

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    const embed = new EmbedBuilder()
      .setTitle("⚔️ 1v1 Duel Complete")
      .setColor(0xff4654)
      .addFields(
        { name: "Winner", value: `<@${winnerId}>`, inline: true },
        { name: "Opponent", value: `<@${loserId}>`, inline: true },
        { name: "Tier", value: tier.label, inline: true },
        { name: "Prize", value: `$${tier.prize.toFixed(2)}`, inline: true },
        { name: "Map", value: match.pickBanState.selectedMap || "Unknown", inline: true },
        { name: "Match ID", value: `\`${match._id.toString()}\``, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error logging matchmaking result:", err);
  }
}

/**
 * Log a 1v1 tournament result
 */
async function logTournamentResult(client, tournament, winnerId, payout) {
  try {
    const guild = client.guilds.cache.get(tournament.serverId);
    if (!guild) return;

    const channel = await guild.channels.fetch(MATCH_LOG_CHANNEL_ID);
    if (!channel) {
      console.error("Match log channel not found");
      return;
    }

    const tierName = tournament.tierKey ? tournament.tierKey : "Unknown";

    const embed = new EmbedBuilder()
      .setTitle("🏆 1v1 Tournament Complete")
      .setColor(0x5865f2)
      .addFields(
        { name: "Winner", value: `<@${winnerId}>`, inline: true },
        { name: "Tier", value: tierName, inline: true },
        { name: "Players", value: `${tournament.size}`, inline: true },
        { name: "Prize", value: `$${payout.toFixed(2)}`, inline: true },
        { name: "Tournament ID", value: `\`${tournament._id.toString()}\``, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error logging tournament result:", err);
  }
}

/**
 * Log a 2v2 tournament result
 */
async function log2v2TournamentResult(client, tournament, winningTeam, totalPayout) {
  try {
    const guild = client.guilds.cache.get(tournament.serverId);
    if (!guild) return;

    const channel = await guild.channels.fetch(MATCH_LOG_CHANNEL_ID);
    if (!channel) {
      console.error("Match log channel not found");
      return;
    }

    const tierName = tournament.tierKey ? tournament.tierKey : "Unknown";
    const payoutPerPlayer = totalPayout / 2;

    const teamMembers = winningTeam.players.map((id) => `<@${id}>`).join(", ");

    const embed = new EmbedBuilder()
      .setTitle("🏆 2v2 Tournament Complete")
      .setColor(0x57f287)
      .addFields(
        { name: "Winning Team", value: winningTeam.teamName || "Team", inline: false },
        { name: "Players", value: teamMembers, inline: false },
        { name: "Tier", value: tierName, inline: true },
        { name: "Teams", value: `${tournament.size / 2}`, inline: true },
        { name: "Total Prize", value: `$${totalPayout.toFixed(2)}`, inline: true },
        { name: "Per Player", value: `$${payoutPerPlayer.toFixed(2)}`, inline: true },
        { name: "Tournament ID", value: `\`${tournament._id.toString()}\``, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error logging 2v2 tournament result:", err);
  }
}

module.exports = {
  logMatchmakingResult,
  logTournamentResult,
  log2v2TournamentResult,
};
