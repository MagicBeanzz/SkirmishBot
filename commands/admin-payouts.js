const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const PayoutRequest = require("../models/PayoutRequest");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-payout")
    .setDescription("Admin: Manage payout requests")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List pending payout requests")
        .addStringOption((opt) =>
          opt
            .setName("status")
            .setDescription("Filter by status")
            .addChoices(
              { name: "Pending", value: "pending" },
              { name: "Approved", value: "approved" },
              { name: "Rejected", value: "rejected" },
              { name: "Completed", value: "completed" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Approve and complete a payout request")
        .addStringOption((opt) =>
          opt
            .setName("request_id")
            .setDescription("Request ID to approve")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("notes").setDescription("Optional admin notes")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reject")
        .setDescription("Reject a payout request")
        .addStringOption((opt) =>
          opt
            .setName("request_id")
            .setDescription("Request ID to reject")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Reason for rejection")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View details of a specific payout request")
        .addStringOption((opt) =>
          opt
            .setName("request_id")
            .setDescription("Request ID to view")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const serverId = interaction.guild.id;

    if (sub === "list") {
      const status = interaction.options.getString("status") || "pending";
      const requests = await PayoutRequest.find({ serverId, status })
        .sort({ createdAt: -1 })
        .limit(10);

      if (!requests.length) {
        return interaction.editReply(`No ${status} payout requests found.`);
      }

      let response = `**${status.toUpperCase()} Payout Requests:**\n\n`;
      for (const req of requests) {
        response += `**ID:** \`${req.id}\`\n`;
        response += `• User: <@${req.userId}>\n`;
        response += `• Amount: **$${req.amount.toFixed(2)}**\n`;
        response += `• Method: ${req.method} (${req.paymentDetails})\n`;
        response += `• Requested: ${req.createdAt.toLocaleString()}\n`;
        if (req.processedBy) {
          response += `• Processed by: <@${req.processedBy}>\n`;
        }
        response += `\n`;
      }

      return interaction.editReply(response);
    }

    if (sub === "approve") {
      const requestId = interaction.options.getString("request_id");
      const notes = interaction.options.getString("notes");

      const request = await PayoutRequest.findById(requestId);
      if (!request) {
        return interaction.editReply("❌ Request not found.");
      }

      if (request.status !== "pending") {
        return interaction.editReply(
          `❌ This request has already been ${request.status}.`
        );
      }

      // Deduct from user's balance
      const profile = await Profile.findOne({
        serverId: request.serverId,
        userId: request.userId,
      });

      if (!profile) {
        return interaction.editReply("❌ User profile not found.");
      }

      if (profile.winningsBalance < request.amount) {
        return interaction.editReply(
          `❌ User only has $${profile.winningsBalance.toFixed(
            2
          )} available (requested $${request.amount.toFixed(2)}).`
        );
      }

      // Deduct the amount
      profile.winningsBalance -= request.amount;
      await profile.save();

      // Mark as completed
      request.status = "completed";
      request.processedBy = interaction.user.id;
      request.processedAt = new Date();
      if (notes) request.notes = notes;
      await request.save();

      // Try to DM the user
      try {
        const user = await interaction.client.users.fetch(request.userId);
        await user.send(
          `✅ **Payout Completed!**\n\n` +
            `Your payout request of **$${request.amount.toFixed(
              2
            )}** has been processed.\n` +
            `Payment sent via **${request.method}** to **${request.paymentDetails}**.\n\n` +
            `Request ID: \`${request.id}\``
        );
      } catch (err) {
        console.log("Could not DM user about payout completion");
      }

      return interaction.editReply(
        `✅ **Payout Approved & Completed**\n\n` +
          `• Request ID: \`${request.id}\`\n` +
          `• User: <@${request.userId}>\n` +
          `• Amount: **$${request.amount.toFixed(2)}**\n` +
          `• Method: ${request.method}\n` +
          `• Details: ${request.paymentDetails}\n` +
          `• Deducted from user's balance\n` +
          `• User has been notified via DM`
      );
    }

    if (sub === "reject") {
      const requestId = interaction.options.getString("request_id");
      const reason = interaction.options.getString("reason");

      const request = await PayoutRequest.findById(requestId);
      if (!request) {
        return interaction.editReply("❌ Request not found.");
      }

      if (request.status !== "pending") {
        return interaction.editReply(
          `❌ This request has already been ${request.status}.`
        );
      }

      request.status = "rejected";
      request.processedBy = interaction.user.id;
      request.processedAt = new Date();
      request.notes = reason;
      await request.save();

      // Try to DM the user
      try {
        const user = await interaction.client.users.fetch(request.userId);
        await user.send(
          `❌ **Payout Request Rejected**\n\n` +
            `Your payout request of **$${request.amount.toFixed(
              2
            )}** has been rejected.\n` +
            `**Reason:** ${reason}\n\n` +
            `Your winnings balance remains unchanged. Contact an admin if you have questions.\n` +
            `Request ID: \`${request.id}\``
        );
      } catch (err) {
        console.log("Could not DM user about payout rejection");
      }

      return interaction.editReply(
        `❌ **Payout Rejected**\n\n` +
          `• Request ID: \`${request.id}\`\n` +
          `• User: <@${request.userId}>\n` +
          `• Amount: **$${request.amount.toFixed(2)}**\n` +
          `• Reason: ${reason}\n` +
          `• User has been notified via DM`
      );
    }

    if (sub === "view") {
      const requestId = interaction.options.getString("request_id");
      const request = await PayoutRequest.findById(requestId);

      if (!request) {
        return interaction.editReply("❌ Request not found.");
      }

      let response = `**Payout Request Details**\n\n`;
      response += `• **ID:** \`${request.id}\`\n`;
      response += `• **User:** <@${request.userId}>\n`;
      response += `• **Amount:** $${request.amount.toFixed(2)}\n`;
      response += `• **Method:** ${request.method}\n`;
      response += `• **Details:** ${request.paymentDetails}\n`;
      response += `• **Status:** ${request.status}\n`;
      response += `• **Requested:** ${request.createdAt.toLocaleString()}\n`;
      if (request.processedBy) {
        response += `• **Processed by:** <@${request.processedBy}>\n`;
        response += `• **Processed at:** ${request.processedAt.toLocaleString()}\n`;
      }
      if (request.notes) {
        response += `• **Notes:** ${request.notes}\n`;
      }

      return interaction.editReply(response);
    }
  },
};
