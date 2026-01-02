const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const PlayerStats = require("../models/PlayerStats");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-clear-leaderboard")
    .setDescription(
      "Admin: Clear ALL player statistics and reset the leaderboard"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("confirm")
        .setDescription('Type "CONFIRM" to proceed with clearing all stats')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const confirmation = interaction.options.getString("confirm");
    const serverId = interaction.guild.id;

    // Safety check - require exact confirmation
    if (confirmation !== "CONFIRM") {
      return interaction.editReply(
        "⚠️ **Leaderboard clear cancelled.**\n\n" +
          "To clear all player stats, you must type exactly: `CONFIRM`\n\n" +
          "**Warning:** This action cannot be undone and will delete:\n" +
          "• All wins and losses\n" +
          "• All win rates\n" +
          "• All lifetime earnings stats\n" +
          "• All tournament participation records\n" +
          "• All win streaks\n\n" +
          "*(Note: This does NOT affect actual ticket balances or winnings)*"
      );
    }

    try {
      // Get count before deletion
      const count = await PlayerStats.countDocuments({ serverId });

      // Delete all player stats for this server
      const result = await PlayerStats.deleteMany({ serverId });

      // Refresh leaderboard
      const { refreshLeaderboard } = require("../components/leaderboardPanel");
      await refreshLeaderboard(interaction.client);

      return interaction.editReply(
        `✅ **Leaderboard cleared successfully!**\n\n` +
          `Deleted **${result.deletedCount}** player stat records.\n\n` +
          `The leaderboard has been reset. All players start fresh!\n\n` +
          `*(Player balances and winnings were NOT affected)*`
      );
    } catch (err) {
      console.error("Error clearing leaderboard:", err);
      return interaction.editReply(
        "❌ Failed to clear leaderboard. Check console for errors."
      );
    }
  },
};
