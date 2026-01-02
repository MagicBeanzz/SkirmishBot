const { SlashCommandBuilder } = require("discord.js");
const {
  getPrizes,
  searchPrizes,
  getPrizeById,
  getUserRedemptions,
} = require("../services/prizeService");
const {
  buildCatalogEmbed,
  buildPrizeEmbed,
  buildRedemptionHistoryEmbed,
  buildPaginationButtons,
  buildCategorySelectMenu,
  buildRedeemButton,
} = require("../components/prizeCatalog");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prizes")
    .setDescription("Browse and redeem prizes from the catalog")
    .addSubcommand((sc) =>
      sc
        .setName("browse")
        .setDescription("Browse the prize catalog")
        .addStringOption((opt) =>
          opt
            .setName("category")
            .setDescription("Filter by category")
            .setRequired(false)
            .addChoices(
              { name: "All", value: "all" },
              { name: "Vintage", value: "vintage" },
              { name: "Modern", value: "modern" },
              { name: "Graded", value: "graded" },
              { name: "Sealed", value: "sealed" },
              { name: "Ultra Rare", value: "ultra-rare" },
              { name: "Bulk", value: "bulk" },
              { name: "Other", value: "other" }
            )
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("search")
        .setDescription("Search for prizes by name")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Search term")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc
        .setName("view")
        .setDescription("View details of a specific prize")
        .addStringOption((opt) =>
          opt
            .setName("prize-id")
            .setDescription("Prize ID")
            .setRequired(true)
        )
    )
    .addSubcommand((sc) =>
      sc.setName("history").setDescription("View your redemption history")
    )
    .addSubcommand((sc) =>
      sc.setName("featured").setDescription("View featured prizes")
    ),

  async execute(interaction) {
    const serverId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    // Get user profile for points
    let profile = await Profile.findOne({ userId, serverId });

    if (sub === "browse") {
      await interaction.deferReply();

      const category = interaction.options.getString("category") || "all";
      const filterCategory = category === "all" ? null : category;

      const result = await getPrizes({
        category: filterCategory,
        page: 0,
        limit: 5,
      });

      if (result.prizes.length === 0) {
        return interaction.editReply({
          content: "❌ No prizes found in this category.",
          ephemeral: true,
        });
      }

      const embed = buildCatalogEmbed(
        result.prizes,
        result.page,
        result.totalPages,
        category
      );
      const pagination = buildPaginationButtons(
        result.page,
        result.totalPages,
        result.hasMore
      );
      const categoryMenu = buildCategorySelectMenu();

      return interaction.editReply({
        embeds: [embed],
        components: [categoryMenu, pagination],
      });
    }

    if (sub === "search") {
      await interaction.deferReply();

      const query = interaction.options.getString("query");
      const prizes = await searchPrizes(query, 10);

      if (prizes.length === 0) {
        return interaction.editReply({
          content: `❌ No prizes found matching "${query}".`,
          ephemeral: true,
        });
      }

      const embed = buildCatalogEmbed(prizes, 0, 1, `Search: ${query}`);

      return interaction.editReply({
        embeds: [embed],
      });
    }

    if (sub === "view") {
      await interaction.deferReply();

      const prizeId = interaction.options.getString("prize-id");
      const prize = await getPrizeById(prizeId);

      if (!prize) {
        return interaction.editReply({
          content: "❌ Prize not found.",
          ephemeral: true,
        });
      }

      const userPoints = profile ? profile.points : 0;
      const embed = buildPrizeEmbed(prize, userPoints);
      const canRedeem =
        prize.active &&
        prize.stock > 0 &&
        profile &&
        profile.points >= prize.pointCost;
      const redeemButton = buildRedeemButton(prize._id, canRedeem);

      return interaction.editReply({
        embeds: [embed],
        components: [redeemButton],
      });
    }

    if (sub === "history") {
      await interaction.deferReply({ ephemeral: true });

      if (!profile) {
        return interaction.editReply({
          content:
            "❌ Profile not found. Use /queue join first to create a profile.",
        });
      }

      const redemptions = await getUserRedemptions(userId, serverId, 10);
      const embed = buildRedemptionHistoryEmbed(redemptions, profile.points);

      return interaction.editReply({
        embeds: [embed],
      });
    }

    if (sub === "featured") {
      await interaction.deferReply();

      const result = await getPrizes({
        featured: true,
        page: 0,
        limit: 5,
      });

      if (result.prizes.length === 0) {
        return interaction.editReply({
          content: "❌ No featured prizes available right now.",
        });
      }

      const embed = buildCatalogEmbed(
        result.prizes,
        result.page,
        result.totalPages,
        "Featured"
      );
      const pagination = buildPaginationButtons(
        result.page,
        result.totalPages,
        result.hasMore,
        "featured"
      );

      return interaction.editReply({
        embeds: [embed],
        components: [pagination],
      });
    }
  },
};
