const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
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

    // Find ACTIVE tournaments where target is/was in
    const tourneys = await Tournament.find({
      serverId,
      state: BRACKET_STATES.ACTIVE,
      playerIds: target.id,
    });

    if (!tourneys.length) {
      return interaction.editReply(
        `No active tournaments found for ${target}.`
      );
    }

    let changed = 0;
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

        changed++;
      }
    }

    // Refresh leaderboard after all forfeits
    try {
      await refreshLeaderboard(interaction.client);
    } catch (err) {
      console.error("Failed to refresh leaderboard:", err);
    }

    if (!changed) {
      return interaction.editReply(
        `No unfinished matches found for ${target}.`
      );
    }

    return interaction.editReply(
      `✅ Forfeited **${changed}** pending match(es) for ${target}. Brackets advanced where applicable.\n`
    );
  },
};
