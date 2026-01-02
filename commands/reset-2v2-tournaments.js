const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const Team = require("../models/Team");
const QueueEntry2v2 = require("../models/QueueEntry2v2");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reset-2v2-tournaments")
    .setDescription(
      "Admin: Reset all 2v2 tournament and match data so everyone can queue again."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const serverId = interaction.guild.id;

      // Delete 2v2 tournaments (marked with gameMode: "2v2")
      const deleted2v2Tourneys = await Tournament.deleteMany({
        serverId,
        gameMode: "2v2",
      });

      // Delete 2v2 matches
      const deleted2v2Matches = await Match.deleteMany({
        serverId,
        gameMode: "2v2",
      });

      // Clear 2v2 queue
      const deletedQueueEntries = await QueueEntry2v2.deleteMany({ serverId });

      // Reset all teams (remove them from queue, but don't disband them)
      await Team.updateMany(
        { serverId, queuedFor: { $ne: null } },
        { $set: { queuedFor: null } }
      );

      return interaction.editReply(
        `✅ **2v2 Reset Complete**\n\n` +
          `Deleted **${deleted2v2Tourneys.deletedCount}** 2v2 tournaments\n` +
          `Deleted **${deleted2v2Matches.deletedCount}** 2v2 matches\n` +
          `Cleared **${deletedQueueEntries.deletedCount}** 2v2 queue entries\n\n` +
          `All players can now queue for 2v2 again.\n` +
          `Teams remain intact - use \`/team disband\` if you want to leave your team.`
      );
    } catch (err) {
      console.error("Error resetting 2v2 tournaments:", err);
      return interaction.editReply(
        "❌ Failed to reset 2v2 tournaments and matches. Check console for errors."
      );
    }
  },
};
