const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reset-tournaments")
    .setDescription(
      "Admin: Reset all tournament and match data so everyone can queue again."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const serverId = interaction.guild.id;

      const deletedMatches = await Match.deleteMany({ serverId });
      const deletedTourneys = await Tournament.deleteMany({ serverId });

      return interaction.editReply(
        `✅ Reset complete.\nDeleted **${deletedTourneys.deletedCount}** tournaments and **${deletedMatches.deletedCount}** matches.\nAll players can now queue freely.`
      );
    } catch (err) {
      console.error("Error resetting tournaments:", err);
      return interaction.editReply(
        "❌ Failed to reset tournaments and matches. Check console for errors."
      );
    }
  },
};
