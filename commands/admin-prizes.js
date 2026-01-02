const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Prize = require("../models/Prize");
const {
  getPendingRedemptions,
  updateRedemptionStatus,
} = require("../services/prizeService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("admin-prizes")
    .setDescription("Admin commands for prize catalog management")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sc) =>
      sc
        .setName("add")
        .setDescription("Add a new prize to the catalog")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Prize name").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Prize description")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("image-url")
            .setDescription("Image URL (Discord CDN or external)")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("points")
            .setDescription("Point cost")
            .setRequired(true)
            .setMinValue(1)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("stock")
            .setDescription("Available quantity")
            .setRequired(true)
            .setMinValue(0)
        )
        .addStringOption((opt) =>
          opt
            .setName("category")
            .setDescription("Prize category")
            .setRequired(true)
            .addChoices(
              { name: "Vintage", value: "vintage" },
              { name: "Modern", value: "modern" },
              { name: "Graded", value: "graded" },
              { name: "Sealed", value: "sealed" },
              { name: "Ultra Rare", value: "ultra-rare" },
              { name: "Bulk", value: "bulk" },
              { name: "Other", value: "other" }
            )
        )
        .addBooleanOption((opt) =>
          opt
            .setName("featured")
            .setDescription("Feature this prize?")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("card-set")
            .setDescription("Pokemon card set (optional)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("card-number")
            .setDescription("Card number (e.g., 4/102)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("condition")
            .setDescription("Card condition (e.g., PSA 10, Near Mint)")
            .setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("rarity")
            .setDescription("Card rarity (e.g., Holo Rare)")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("edit")
        .setDescription("Edit an existing prize")
        .addStringOption((opt) =>
          opt
            .setName("prize-id")
            .setDescription("Prize ID to edit")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("field")
            .setDescription("Field to edit")
            .setRequired(true)
            .addChoices(
              { name: "Name", value: "name" },
              { name: "Description", value: "description" },
              { name: "Image URL", value: "imageUrl" },
              { name: "Point Cost", value: "pointCost" },
              { name: "Stock", value: "stock" },
              { name: "Category", value: "category" },
              { name: "Featured", value: "featured" },
              { name: "Active", value: "active" }
            )
        )
        .addStringOption((opt) =>
          opt
            .setName("value")
            .setDescription("New value")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("remove")
        .setDescription("Remove a prize from the catalog")
        .addStringOption((opt) =>
          opt
            .setName("prize-id")
            .setDescription("Prize ID to remove")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("stock")
        .setDescription("Update prize stock")
        .addStringOption((opt) =>
          opt
            .setName("prize-id")
            .setDescription("Prize ID")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("quantity")
            .setDescription("New stock quantity")
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("pending")
        .setDescription("View pending prize redemptions")
    )
    .addSubcommand((sc) =>
      sc
        .setName("approve")
        .setDescription("Approve a redemption and mark as shipped")
        .addStringOption((opt) =>
          opt
            .setName("redemption-id")
            .setDescription("Redemption ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("tracking")
            .setDescription("Tracking number (optional)")
            .setRequired(false)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("cancel")
        .setDescription("Cancel a redemption and refund points")
        .addStringOption((opt) =>
          opt
            .setName("redemption-id")
            .setDescription("Redemption ID")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("Cancellation reason")
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === "add") {
      const prizeData = {
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description"),
        imageUrl: interaction.options.getString("image-url"),
        pointCost: interaction.options.getInteger("points"),
        stock: interaction.options.getInteger("stock"),
        category: interaction.options.getString("category"),
        featured: interaction.options.getBoolean("featured") || false,
        cardSet: interaction.options.getString("card-set") || null,
        cardNumber: interaction.options.getString("card-number") || null,
        condition: interaction.options.getString("condition") || null,
        rarity: interaction.options.getString("rarity") || null,
        active: true,
      };

      const prize = await Prize.create(prizeData);

      return interaction.editReply(
        `✅ Prize added successfully!\n\n` +
          `**${prize.name}**\n` +
          `ID: \`${prize._id}\`\n` +
          `Points: ${prize.pointCost}\n` +
          `Stock: ${prize.stock}\n` +
          `Category: ${prize.category}`
      );
    }

    if (sub === "edit") {
      const prizeId = interaction.options.getString("prize-id");
      const field = interaction.options.getString("field");
      const value = interaction.options.getString("value");

      const prize = await Prize.findById(prizeId);
      if (!prize) {
        return interaction.editReply("❌ Prize not found.");
      }

      // Type conversion based on field
      let convertedValue = value;
      if (field === "pointCost" || field === "stock") {
        convertedValue = parseInt(value);
        if (isNaN(convertedValue)) {
          return interaction.editReply("❌ Value must be a number.");
        }
      } else if (field === "featured" || field === "active") {
        convertedValue = value.toLowerCase() === "true";
      }

      prize[field] = convertedValue;
      await prize.save();

      return interaction.editReply(
        `✅ Prize updated!\n\n` +
          `**${prize.name}**\n` +
          `${field}: ${convertedValue}`
      );
    }

    if (sub === "remove") {
      const prizeId = interaction.options.getString("prize-id");
      const prize = await Prize.findByIdAndDelete(prizeId);

      if (!prize) {
        return interaction.editReply("❌ Prize not found.");
      }

      return interaction.editReply(
        `✅ Prize **${prize.name}** removed from catalog.`
      );
    }

    if (sub === "stock") {
      const prizeId = interaction.options.getString("prize-id");
      const quantity = interaction.options.getInteger("quantity");

      const prize = await Prize.findById(prizeId);
      if (!prize) {
        return interaction.editReply("❌ Prize not found.");
      }

      prize.stock = quantity;
      await prize.save();

      return interaction.editReply(
        `✅ Stock updated for **${prize.name}**\n` +
          `New stock: **${quantity}**`
      );
    }

    if (sub === "pending") {
      const serverId = interaction.guild.id;
      const redemptions = await getPendingRedemptions(serverId);

      if (redemptions.length === 0) {
        return interaction.editReply("✅ No pending redemptions.");
      }

      let msg = `📦 **Pending Redemptions** (${redemptions.length})\n\n`;

      redemptions.forEach((r) => {
        msg +=
          `**${r.prizeName}** - ${r.pointCost} points\n` +
          `User: <@${r.userId}>\n` +
          `Address: ${r.shippingAddress.fullName}, ${r.shippingAddress.addressLine1}, ${r.shippingAddress.city}, ${r.shippingAddress.state} ${r.shippingAddress.zipCode}\n` +
          `Redemption ID: \`${r._id}\`\n` +
          `Requested: <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>\n\n`;
      });

      return interaction.editReply(msg);
    }

    if (sub === "approve") {
      const redemptionId = interaction.options.getString("redemption-id");
      const tracking = interaction.options.getString("tracking");

      const result = await updateRedemptionStatus(
        redemptionId,
        "shipped",
        tracking,
        "Approved and shipped by admin",
        interaction.user.id
      );

      if (!result.success) {
        return interaction.editReply(result.msg);
      }

      // Notify user
      try {
        const user = await interaction.client.users.fetch(
          result.redemption.userId
        );
        await user.send(
          `📦 Your prize **${result.redemption.prizeName}** has been shipped!\n\n` +
            (tracking
              ? `Tracking Number: \`${tracking}\`\n`
              : "You'll receive it soon!\n") +
            `Redemption ID: \`${redemptionId}\``
        );
      } catch (e) {
        console.error("Failed to DM user:", e);
      }

      return interaction.editReply(
        `✅ Redemption approved and marked as shipped!\n` +
          `Prize: **${result.redemption.prizeName}**\n` +
          `User: <@${result.redemption.userId}>\n` +
          (tracking ? `Tracking: \`${tracking}\`` : "")
      );
    }

    if (sub === "cancel") {
      const redemptionId = interaction.options.getString("redemption-id");
      const reason =
        interaction.options.getString("reason") || "Cancelled by admin";

      const result = await updateRedemptionStatus(
        redemptionId,
        "cancelled",
        null,
        reason,
        interaction.user.id
      );

      if (!result.success) {
        return interaction.editReply(result.msg);
      }

      // Notify user
      try {
        const user = await interaction.client.users.fetch(
          result.redemption.userId
        );
        await user.send(
          `❌ Your redemption for **${result.redemption.prizeName}** has been cancelled.\n\n` +
            `Reason: ${reason}\n` +
            `Your **${result.redemption.pointCost}** points have been refunded.\n` +
            `Redemption ID: \`${redemptionId}\``
        );
      } catch (e) {
        console.error("Failed to DM user:", e);
      }

      return interaction.editReply(
        `✅ Redemption cancelled and points refunded.\n` +
          `Prize: **${result.redemption.prizeName}**\n` +
          `User: <@${result.redemption.userId}>\n` +
          `Points refunded: **${result.redemption.pointCost}**`
      );
    }
  },
};
