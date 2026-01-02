const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-tickets")
    .setDescription("Admin: Manage user tickets and winnings")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add tickets to a user")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to give tickets to")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Number of tickets to add")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove tickets from a user")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to remove tickets from")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Number of tickets to remove")
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set user's ticket balance to exact amount")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to set tickets for")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Exact number of tickets")
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-winnings")
        .setDescription("Add winnings to a user")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to give winnings to")
            .setRequired(true)
        )
        .addNumberOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Amount in dollars (e.g., 25.50)")
            .setRequired(true)
            .setMinValue(0.01)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-winnings")
        .setDescription("Remove winnings from a user")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to remove winnings from")
            .setRequired(true)
        )
        .addNumberOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Amount in dollars (e.g., 25.50)")
            .setRequired(true)
            .setMinValue(0.01)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("set-winnings")
        .setDescription("Set user's winnings to exact amount")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("User to set winnings for")
            .setRequired(true)
        )
        .addNumberOption((opt) =>
          opt
            .setName("amount")
            .setDescription("Exact amount in dollars (e.g., 25.50)")
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View a user's balance details")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to check").setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user");
    const serverId = interaction.guild.id;

    // Ensure user has a profile
    let profile = await Profile.findOne({ serverId, userId: user.id });
    if (!profile) {
      profile = await Profile.create({
        serverId,
        userId: user.id,
        balance: 0,
        winningsBalance: 0,
      });
    }

    // Handle different subcommands
    switch (subcommand) {
      case "add": {
        const amount = interaction.options.getInteger("amount");
        profile.balance = (profile.balance || 0) + amount;
        await profile.save();

        return interaction.editReply(
          `✅ Added **${amount}** tickets to ${user}.\n` +
            `New balance: **${profile.balance}** tickets.`
        );
      }

      case "remove": {
        const amount = interaction.options.getInteger("amount");
        const oldBalance = profile.balance || 0;
        profile.balance = Math.max(0, oldBalance - amount);
        await profile.save();

        const actualRemoved = oldBalance - profile.balance;

        return interaction.editReply(
          `✅ Removed **${actualRemoved}** tickets from ${user}.\n` +
            `New balance: **${profile.balance}** tickets.` +
            (actualRemoved < amount
              ? `\n⚠️ Only had ${oldBalance} tickets to remove.`
              : "")
        );
      }

      case "set": {
        const amount = interaction.options.getInteger("amount");
        const oldBalance = profile.balance || 0;
        profile.balance = amount;
        await profile.save();

        return interaction.editReply(
          `✅ Set ${user}'s tickets to **${amount}**.\n` +
            `Previous balance: **${oldBalance}** tickets.`
        );
      }

      case "add-winnings": {
        const amount = interaction.options.getNumber("amount");
        profile.winningsBalance = (profile.winningsBalance || 0) + amount;
        await profile.save();

        return interaction.editReply(
          `✅ Added **$${amount.toFixed(2)}** winnings to ${user}.\n` +
            `New winnings: **$${profile.winningsBalance.toFixed(2)}**.`
        );
      }

      case "remove-winnings": {
        const amount = interaction.options.getNumber("amount");
        const oldWinnings = profile.winningsBalance || 0;
        profile.winningsBalance = Math.max(0, oldWinnings - amount);
        await profile.save();

        const actualRemoved = oldWinnings - profile.winningsBalance;

        return interaction.editReply(
          `✅ Removed **$${actualRemoved.toFixed(
            2
          )}** winnings from ${user}.\n` +
            `New winnings: **$${profile.winningsBalance.toFixed(2)}**.` +
            (actualRemoved < amount
              ? `\n⚠️ Only had $${oldWinnings.toFixed(2)} to remove.`
              : "")
        );
      }

      case "set-winnings": {
        const amount = interaction.options.getNumber("amount");
        const oldWinnings = profile.winningsBalance || 0;
        profile.winningsBalance = amount;
        await profile.save();

        return interaction.editReply(
          `✅ Set ${user}'s winnings to **$${amount.toFixed(2)}**.\n` +
            `Previous winnings: **$${oldWinnings.toFixed(2)}**.`
        );
      }

      case "view": {
        const tickets = profile.balance || 0;
        const winnings = profile.winningsBalance || 0;

        return interaction.editReply(
          `📊 **Balance for ${user.tag}**\n\n` +
            `🎟️ Tickets: **${tickets}**\n` +
            `💵 Winnings: **$${winnings.toFixed(2)}**\n\n` +
            `User ID: \`${user.id}\``
        );
      }

      default:
        return interaction.editReply("Unknown subcommand.");
    }
  },
};
