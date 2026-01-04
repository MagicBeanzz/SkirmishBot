const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const MatchmakingMatch = require("../models/MatchmakingMatch");
const Profile = require("../models/profileSchema");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");
const { BRACKET_STATES } = require("../config/constants");
const {
  considerAdvanceOrFinish,
  closeMatchChannel,
} = require("../services/tournamentService");
const { recordMatchResult } = require("../services/statsService");
const { refreshLeaderboard } = require("../components/leaderboardPanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-forfeit")
    .setDescription(
      "Admin: Forfeit all unfinished matches for a user (gives wins to their opponents)."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to forfeit").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const serverId = interaction.guild.id;
    const target = interaction.options.getUser("user");

    let tournamentMatches = 0;
    let matchmakingMatches = 0;

    // ========== Tournament Matches ==========
    // Find ACTIVE tournaments where target is/was in
    const tourneys = await Tournament.find({
      serverId,
      state: BRACKET_STATES.ACTIVE,
      playerIds: target.id,
    });

    for (const t of tourneys) {
      const pending = await Match.find({
        tournamentId: t._id,
        winnerId: { $in: [null, undefined] },
        $or: [{ playerA: target.id }, { playerB: target.id }],
      });

      for (const m of pending) {
        const winnerId = m.playerA === target.id ? m.playerB : m.playerA;
        const loserId = target.id;
        if (!winnerId) continue;

        m.winnerId = winnerId;
        m.state = "COMPLETE";
        await m.save();

        // Record match stats (winner gets +1 win, loser gets +1 loss)
        try {
          await recordMatchResult(serverId, winnerId, loserId);
        } catch (err) {
          console.error("Failed to record match stats:", err);
        }

        // Close match channel politely if it exists
        try {
          await closeMatchChannel(interaction.client, m, winnerId);
        } catch {}

        // Attempt to advance or complete the tournament
        try {
          await considerAdvanceOrFinish(interaction.client, t._id);
        } catch {}

        tournamentMatches++;
      }
    }

    // ========== Matchmaking Matches ==========
    // Find active matchmaking matches where target is participating
    const mmMatches = await MatchmakingMatch.find({
      serverId,
      $or: [{ player1Id: target.id }, { player2Id: target.id }],
      status: { $in: ["pickban", "playing"] },
    });

    for (const mm of mmMatches) {
      const winnerId = mm.player1Id === target.id ? mm.player2Id : mm.player1Id;
      const loserId = target.id;

      // Update match as completed
      mm.winnerId = winnerId;
      mm.status = "completed";
      mm.completedAt = new Date();
      await mm.save();

      // Award prize to winner
      const tier = MATCHMAKING_TIERS.find((t) => t.key === mm.tierKey);
      if (tier) {
        const winnerProfile = await Profile.findOne({
          serverId,
          userId: winnerId,
        });
        if (winnerProfile) {
          winnerProfile.winningsBalance = (winnerProfile.winningsBalance || 0) + tier.prize;
          await winnerProfile.save();
        }

        // Record match stats
        try {
          const { recordMatchResult, recordMatchmakingWin } = require("../services/statsService");
          await recordMatchResult(serverId, winnerId, loserId);
          await recordMatchmakingWin(serverId, winnerId, tier.prize);
        } catch (err) {
          console.error("Error recording forfeit match stats:", err);
        }
      }

      // Delete match channel
      try {
        if (mm.channelId) {
          const channel = await interaction.guild.channels.fetch(mm.channelId);
          if (channel) {
            await channel.send(
              `⚠️ **Match Forfeited by Admin**\n\n` +
                `<@${loserId}> has been forfeited by an admin.\n` +
                `<@${winnerId}> wins by forfeit and receives **$${tier.prize.toFixed(2)}**!\n\n` +
                `This channel will be deleted in 10 seconds.`
            );
            setTimeout(async () => {
              try {
                await channel.delete();
              } catch (err) {
                console.error("Error deleting matchmaking channel:", err);
              }
            }, 10000);
          }
        }
      } catch (err) {
        console.error("Failed to close matchmaking channel:", err);
      }

      matchmakingMatches++;
    }

    // Refresh leaderboard after all forfeits
    try {
      await refreshLeaderboard(interaction.client);
    } catch (err) {
      console.error("Failed to refresh leaderboard:", err);
    }

    const totalMatches = tournamentMatches + matchmakingMatches;

    if (!totalMatches) {
      return interaction.editReply(
        `No unfinished matches found for ${target}.`
      );
    }

    let msg = `✅ Forfeited **${totalMatches}** pending match(es) for ${target}.\n`;
    if (tournamentMatches > 0) {
      msg += `• Tournament matches: **${tournamentMatches}** (brackets advanced where applicable)\n`;
    }
    if (matchmakingMatches > 0) {
      msg += `• Matchmaking matches: **${matchmakingMatches}**\n`;
    }

    return interaction.editReply(msg);
  },
};
