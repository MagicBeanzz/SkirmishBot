const { SlashCommandBuilder } = require("discord.js");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your current ticket and winnings balance."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const serverId = interaction.guild.id;
      const userId = interaction.user.id;

      // Ensure profile exists (create default if missing)
      let profile = await Profile.findOne({ serverId, userId });
      if (!profile) {
        profile = await Profile.create({
          serverId,
          userId,
          balance: 10,
          winningsBalance: 0,
        });
      }

      const balance = profile.balance ?? 0;
      const winnings = profile.winningsBalance ?? 0;

      return interaction.editReply({
        content:
          `💳 **Your Balance**\n` +
          `• 🎟️ Tickets: **${balance}**\n` +
          `• 💵 Winnings: **$${winnings.toFixed(2)}**`,
        ephemeral: true,
      });
    } catch (err) {
      console.error("Error fetching balance:", err);
      return interaction.editReply({
        content: "❌ Something went wrong while checking your balance.",
        ephemeral: true,
      });
    }
  },
};
