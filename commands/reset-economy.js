const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reset-economy")
    .setDescription(
      "Admin only: reset all player balances to 20 tickets and $0 winnings."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const serverId = interaction.guild.id;
      const result = await Profile.updateMany(
        { serverId },
        { $set: { balance: 0, winningsBalance: 0 } }
      );

      return interaction.editReply(
        `✅ Economy reset complete.\nAffected profiles: **${result.modifiedCount}**.\nAll players now have **0 tickets** and **$0 winnings.**`
      );
    } catch (err) {
      console.error("Error resetting economy:", err);
      return interaction.editReply(
        "❌ Failed to reset the economy. Check console logs."
      );
    }
  },
};
