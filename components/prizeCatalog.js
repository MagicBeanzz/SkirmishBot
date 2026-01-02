const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");

/**
 * Build embed for a single prize (detail view)
 */
function buildPrizeEmbed(prize, userPoints = null) {
  const embed = new EmbedBuilder()
    .setTitle(prize.name)
    .setDescription(prize.description)
    .setColor(prize.featured ? 0xffd700 : 0x5865f2) // Gold for featured, blurple otherwise
    .setImage(prize.imageUrl)
    .addFields(
      {
        name: "💎 Point Cost",
        value: `**${prize.pointCost.toLocaleString()}** points`,
        inline: true,
      },
      {
        name: "📦 Stock",
        value: prize.stock > 0 ? `**${prize.stock}** available` : "**Out of Stock**",
        inline: true,
      },
      {
        name: "📁 Category",
        value: `**${capitalize(prize.category)}**`,
        inline: true,
      }
    );

  // Add Pokemon-specific fields if available
  if (prize.cardSet) {
    embed.addFields({
      name: "🎴 Set",
      value: `**${prize.cardSet}**${prize.cardNumber ? ` (#${prize.cardNumber})` : ""}`,
      inline: true,
    });
  }

  if (prize.condition) {
    embed.addFields({
      name: "⭐ Condition",
      value: `**${prize.condition}**`,
      inline: true,
    });
  }

  if (prize.rarity) {
    embed.addFields({
      name: "✨ Rarity",
      value: `**${prize.rarity}**`,
      inline: true,
    });
  }

  // Show user's points if provided
  if (userPoints !== null) {
    const canAfford = userPoints >= prize.pointCost;
    embed.addFields({
      name: "💰 Your Points",
      value: canAfford
        ? `**${userPoints.toLocaleString()}** points ✅`
        : `**${userPoints.toLocaleString()}** points ❌ (Need ${(prize.pointCost - userPoints).toLocaleString()} more)`,
      inline: false,
    });
  }

  embed.setFooter({ text: `Prize ID: ${prize._id}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Build embed for catalog browse (grid view)
 */
function buildCatalogEmbed(prizes, page, totalPages, category = "All") {
  const embed = new EmbedBuilder()
    .setTitle(`🎁 Prize Catalog - ${capitalize(category)}`)
    .setDescription(
      prizes.length > 0
        ? "Browse available prizes and redeem with your points!"
        : "No prizes found in this category."
    )
    .setColor(0x5865f2);

  // Add prize fields
  prizes.forEach((prize) => {
    const stockInfo = prize.stock > 0 ? `📦 ${prize.stock} left` : "❌ Out of Stock";
    const featuredBadge = prize.featured ? "⭐ " : "";

    embed.addFields({
      name: `${featuredBadge}${prize.name}`,
      value:
        `💎 **${prize.pointCost.toLocaleString()}** points | ${stockInfo}\n` +
        `ID: \`${prize._id}\``,
      inline: false,
    });
  });

  embed.setFooter({ text: `Page ${page + 1}/${totalPages || 1}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Build redemption history embed
 */
function buildRedemptionHistoryEmbed(redemptions, userPoints) {
  const embed = new EmbedBuilder()
    .setTitle("📜 Your Redemption History")
    .setDescription(
      redemptions.length > 0
        ? `You have **${userPoints.toLocaleString()}** points available.`
        : `You have **${userPoints.toLocaleString()}** points. You haven't redeemed any prizes yet!`
    )
    .setColor(0x5865f2);

  redemptions.forEach((r) => {
    const statusEmoji = {
      pending: "⏳",
      approved: "✅",
      shipped: "📦",
      delivered: "🎉",
      cancelled: "❌",
    };

    embed.addFields({
      name: `${statusEmoji[r.status]} ${r.prizeName}`,
      value:
        `**Status:** ${capitalize(r.status)}\n` +
        `**Points:** ${r.pointCost.toLocaleString()}\n` +
        `**Redeemed:** <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>\n` +
        (r.trackingNumber ? `**Tracking:** \`${r.trackingNumber}\`\n` : "") +
        `**ID:** \`${r._id}\``,
      inline: false,
    });
  });

  embed.setFooter({ text: "Use /prizes browse to see available prizes" });
  embed.setTimestamp();

  return embed;
}

/**
 * Build category select menu
 */
function buildCategorySelectMenu(customId = "prize_category") {
  const categories = [
    { label: "All Prizes", value: "all", emoji: "🎁" },
    { label: "Vintage", value: "vintage", emoji: "🕰️" },
    { label: "Modern", value: "modern", emoji: "✨" },
    { label: "Graded Cards", value: "graded", emoji: "💎" },
    { label: "Sealed Products", value: "sealed", emoji: "📦" },
    { label: "Ultra Rare", value: "ultra-rare", emoji: "⭐" },
    { label: "Bulk Lots", value: "bulk", emoji: "🎴" },
    { label: "Other", value: "other", emoji: "🔮" },
  ];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Choose a category")
      .addOptions(categories)
  );
}

/**
 * Build pagination buttons
 */
function buildPaginationButtons(page, totalPages, hasMore, customIdPrefix = "prize") {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_prev`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_page`)
      .setLabel(`Page ${page + 1}/${totalPages || 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}_next`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasMore)
  );

  return row;
}

/**
 * Build redeem button
 */
function buildRedeemButton(prizeId, canRedeem = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`redeem_${prizeId}`)
      .setLabel("🎁 Redeem Prize")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canRedeem)
  );
}

/**
 * Helper: Capitalize first letter
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  buildPrizeEmbed,
  buildCatalogEmbed,
  buildRedemptionHistoryEmbed,
  buildCategorySelectMenu,
  buildPaginationButtons,
  buildRedeemButton,
};
