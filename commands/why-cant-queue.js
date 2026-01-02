const { SlashCommandBuilder } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const { BRACKET_STATES } = require("../config/constants");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("why-cant-queue")
    .setDescription(
      "Shows any unfinished matches that are blocking you from queueing."
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const serverId = interaction.guild.id;
    const userId = interaction.user.id;

    // Find ACTIVE tournaments where user participated
    const tourneys = await Tournament.find({
      serverId,
      state: BRACKET_STATES.ACTIVE,
      playerIds: userId,
    }).lean();

    if (!tourneys.length) {
      return interaction.editReply(
        "✅ No active tournaments found for you. If you still can’t queue, try again now."
      );
    }

    const tIds = tourneys.map((t) => t._id);
    const matches = await Match.find({
      tournamentId: { $in: tIds },
      winnerId: { $in: [null, undefined] },
      $or: [{ playerA: userId }, { playerB: userId }],
    }).lean();

    if (!matches.length) {
      return interaction.editReply(
        "✅ No unfinished matches found blocking you. Try queueing again."
      );
    }

    const lines = [];
    for (const m of matches) {
      const t = tourneys.find(
        (tt) => String(tt._id) === String(m.tournamentId)
      );
      const opp = m.playerA === userId ? m.playerB : m.playerA;
      lines.push(
        [
          `• **Match ID:** \`${m._id}\` (Round ${m.round})`,
          `  **Opponent:** <@${opp}>`,
          t?.tournamentChannelId
            ? `  **Hub:** <#${t.tournamentChannelId}>`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    return interaction.editReply(
      `⛔ You have unfinished match(es):\n\n${lines.join("\n\n")}\n\n` +
        `Use **/reportwin** in the match channel, or ask an admin to forfeit your pending matches with **/admin-forfeit @you**.`
    );
  },
};
