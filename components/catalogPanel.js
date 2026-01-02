const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { getPrizes } = require("../services/prizeService");

const CATALOG_CHANNEL_ID = "1456516444073234463";
let catalogMessageId = null;

/**
 * Build the catalog embed showing prizes
 */
async function buildCatalogEmbed(category = null, page = 0) {
  const result = await getPrizes({
    category: category === "all" ? null : category,
    page,
    limit: 6,
    sortBy: "featured",
    sortOrder: "desc",
  });

  const categoryLabel = category === "all" || !category ? "All Prizes" : capitalize(category);

  const embed = new EmbedBuilder()
    .setTitle(`🎁 Prize Catalog - ${categoryLabel}`)
    .setDescription(
      result.prizes.length > 0
        ? `Browse our collection of Pokemon cards and gaming prizes!\nWin tournaments to earn points, then redeem them here.`
        : "No prizes available in this category."
    )
    .setColor(0x5865f2)
    .setFooter({
      text: `Page ${page + 1}/${result.totalPages || 1} • ${result.total} prizes available`,
    })
    .setTimestamp();

  // Add prize fields with images (show 3 per embed for clean layout)
  const displayPrizes = result.prizes.slice(0, 3);

  displayPrizes.forEach((prize, index) => {
    const stockEmoji = prize.stock > 0 ? "✅" : "❌";
    const featuredBadge = prize.featured ? "⭐ " : "";

    let fieldValue = `💎 **${prize.pointCost.toLocaleString()} points**\n`;
    fieldValue += `📦 ${stockEmoji} ${prize.stock > 0 ? `${prize.stock} in stock` : "Out of stock"}\n`;

    if (prize.condition) fieldValue += `⭐ ${prize.condition}\n`;
    if (prize.cardSet) fieldValue += `🎴 ${prize.cardSet}\n`;

    fieldValue += `\nClick "View Prize #${index + 1}" below for details`;

    embed.addFields({
      name: `${featuredBadge}${prize.name}`,
      value: fieldValue,
      inline: false,
    });
  });

  // Set the main image to the first featured prize
  if (displayPrizes.length > 0 && displayPrizes[0].imageUrl) {
    embed.setImage(displayPrizes[0].imageUrl);
  }

  return { embed, prizes: displayPrizes, hasMore: result.hasMore, totalPages: result.totalPages };
}

/**
 * Build category select menu
 */
function buildCategorySelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("catalog_category")
      .setPlaceholder("📂 Choose a category")
      .addOptions([
        { label: "All Prizes", value: "all", emoji: "🎁", description: "View all available prizes" },
        { label: "Featured", value: "featured", emoji: "⭐", description: "Hand-picked highlights" },
        { label: "Vintage", value: "vintage", emoji: "🕰️", description: "Classic Pokemon cards" },
        { label: "Modern", value: "modern", emoji: "✨", description: "Recent sets" },
        { label: "Graded Cards", value: "graded", emoji: "💎", description: "PSA/BGS graded" },
        { label: "Sealed Products", value: "sealed", emoji: "📦", description: "Booster boxes, ETBs" },
        { label: "Ultra Rare", value: "ultra-rare", emoji: "🌟", description: "Chase cards" },
        { label: "Bulk Lots", value: "bulk", emoji: "🎴", description: "Multiple cards" },
      ])
  );
}

/**
 * Build view prize buttons (for the 3 displayed prizes)
 */
function buildViewPrizeButtons(prizes) {
  const row = new ActionRowBuilder();

  prizes.forEach((prize, index) => {
    if (index < 3) { // Max 3 buttons per row
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`view_prize_${prize._id}`)
          .setLabel(`View Prize #${index + 1}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(prize.stock === 0)
      );
    }
  });

  return row;
}

/**
 * Build pagination buttons
 */
function buildPaginationButtons(page, totalPages, hasMore) {
  const row = new ActionRowBuilder();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`catalog_page_${page - 1}`)
      .setEmoji("◀️")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("catalog_page_info")
      .setLabel(`Page ${page + 1}/${totalPages || 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`catalog_page_${page + 1}`)
      .setEmoji("▶️")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasMore)
  );

  return row;
}

/**
 * Build utility buttons row
 */
function buildUtilityButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("catalog_my_points")
      .setLabel("My Points")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("catalog_redemptions")
      .setLabel("My Redemptions")
      .setEmoji("📦")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("catalog_refresh")
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build the full catalog panel message
 */
async function buildCatalogPanel(category = "all", page = 0) {
  const { embed, prizes, hasMore, totalPages } = await buildCatalogEmbed(category, page);

  const components = [
    buildCategorySelect(),
    prizes.length > 0 ? buildViewPrizeButtons(prizes) : null,
    buildPaginationButtons(page, totalPages, hasMore),
    buildUtilityButtons(),
  ].filter(Boolean);

  return { embeds: [embed], components };
}

/**
 * Post or update the catalog panel in the designated channel
 */
async function upsertCatalogPanel(client, category = "all", page = 0) {
  try {
    const channel = await client.channels.fetch(CATALOG_CHANNEL_ID);
    if (!channel) {
      console.error("Catalog channel not found!");
      return;
    }

    const panelData = await buildCatalogPanel(category, page);

    // If we have a stored message ID, try to update it
    if (catalogMessageId) {
      try {
        const message = await channel.messages.fetch(catalogMessageId);
        await message.edit(panelData);
        console.log("✅ Catalog panel updated");
        return;
      } catch (err) {
        // Message doesn't exist, create new one
        console.log("Previous catalog message not found, creating new one...");
      }
    }

    // Create new panel
    const message = await channel.send(panelData);
    catalogMessageId = message.id;
    console.log(`✅ Catalog panel created: ${message.id}`);
  } catch (err) {
    console.error("Error upserting catalog panel:", err);
  }
}

/**
 * Build detailed prize view (ephemeral response when clicking "View Prize")
 */
function buildPrizeDetailEmbed(prize, userPoints = null) {
  const embed = new EmbedBuilder()
    .setTitle(prize.name)
    .setDescription(prize.description)
    .setColor(prize.featured ? 0xffd700 : 0x5865f2)
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

  if (prize.cardSet) {
    embed.addFields({
      name: "🎴 Card Set",
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

  if (userPoints !== null) {
    const canAfford = userPoints >= prize.pointCost;
    const affordText = canAfford
      ? `You have enough points! ✅`
      : `Need ${(prize.pointCost - userPoints).toLocaleString()} more points ❌`;

    embed.addFields({
      name: "💰 Your Points",
      value: `**${userPoints.toLocaleString()}** points\n${affordText}`,
      inline: false,
    });
  }

  embed.setFooter({ text: `Prize ID: ${prize._id}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Build redeem button for prize detail view
 */
function buildRedeemButton(prizeId, canRedeem = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`redeem_${prizeId}`)
      .setLabel("🎁 Redeem This Prize")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canRedeem)
  );
}

/**
 * Capitalize helper
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ");
}

module.exports = {
  CATALOG_CHANNEL_ID,
  upsertCatalogPanel,
  buildCatalogPanel,
  buildPrizeDetailEmbed,
  buildRedeemButton,
};
