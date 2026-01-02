const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("checkbalance")
    .setDescription("Admin only: Check a user's tickets and winnings balance.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to check").setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const serverId = interaction.guild.id;
      const user = interaction.options.getUser("user");

      const profile = await Profile.findOne({ serverId, userId: user.id });

      if (!profile) {
        return interaction.editReply(
          `No profile found for ${user}. They have not interacted with the bot yet.`
        );
      }

      return interaction.editReply(
        `💳 **${user.tag}'s Balance**\n` +
          `• 🎟️ Tickets: **${profile.balance ?? 0}**\n` +
          `• 💵 Winnings: **$${(profile.winningsBalance ?? 0).toFixed(2)}**`
      );
    } catch (err) {
      console.error("checkbalance command error:", err);
      return interaction.editReply(
        "❌ Failed to fetch user's balance. Check console logs."
      );
    }
  },
};
