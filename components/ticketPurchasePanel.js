const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { TICKET_BUNDLES } = require("../config/ticketBundles");

const TICKET_CHANNEL_ID = "1427041016808210442"; // Wallet channel
const PANEL_TITLE = "🎟️ TICKET SHOP";

function ticketPurchaseButtons() {
  // Create buttons for ticket bundles (2 rows of 3)
  const row1Bundles = TICKET_BUNDLES.slice(0, 3);
  const row2Bundles = TICKET_BUNDLES.slice(3, 6);

  const row1 = new ActionRowBuilder().addComponents(
    ...row1Bundles.map((bundle) =>
      new ButtonBuilder()
        .setCustomId(`BUY_TICKETS_${bundle.id}`)
        .setLabel(`🎟️ ${bundle.tickets} — $${bundle.price.toFixed(2)}`)
        .setStyle(bundle.popular ? ButtonStyle.Success : ButtonStyle.Primary)
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    ...row2Bundles.map((bundle) =>
      new ButtonBuilder()
        .setCustomId(`BUY_TICKETS_${bundle.id}`)
        .setLabel(`🎟️ ${bundle.tickets} — $${bundle.price.toFixed(2)}`)
        .setStyle(bundle.popular ? ButtonStyle.Success : ButtonStyle.Primary)
    )
  );

  // Add "Convert Winnings to Tickets" button
  const convertRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("CONVERT_WINNINGS_TO_TICKETS")
      .setLabel("💰 Convert Winnings to Tickets")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2, convertRow];
}

function buildEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Purchase tickets to enter Skirmish matches and compete for cash prizes."
    )
    .setColor(0x5865f2);

  // Add inline fields for each bundle (3 per row)
  TICKET_BUNDLES.forEach((bundle) => {
    const popularTag = bundle.popular ? " ⭐" : "";
    const bestValue = bundle.popular ? "**BEST VALUE**\n" : "";

    // Calculate savings compared to starter pack (35% fee)
    const baseFeePercent = 35;
    const savings = baseFeePercent - bundle.serviceFeePercent;
    const savingsLine = savings > 0 ? `*Save ${savings}% on fees*` : "";

    embed.addFields({
      name: `${bundle.emoji} ${bundle.label}${popularTag}`,
      value: `${bestValue}🎟️ ${bundle.tickets} Tickets\n**$${bundle.price.toFixed(2)}**\n${savingsLine}`,
      inline: true,
    });
  });

  embed.addFields({
    name: "\u200b",
    value: "💡 **Bigger bundles = Lower fees** • ✅ Stripe Secured",
    inline: false,
  });

  embed.setFooter({ text: "Tickets credited instantly • Entry fees go to prize pools" });

  return embed;
}

/**
 * Ensures a single ticket purchase panel exists.
 */
async function ensureTicketPurchasePanel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(TICKET_CHANNEL_ID);
  const embed = buildEmbed();
  const components = ticketPurchaseButtons();

  // Try to find an existing panel from the bot
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds?.[0]?.title?.includes("TICKET")
  );

  if (existing) {
    try {
      await existing.edit({ embeds: [embed], components });
      return;
    } catch (err) {
      console.warn("Failed to edit existing ticket purchase panel:", err);
    }
  }

  // If none found, send a new one
  await channel.send({ embeds: [embed], components });
}

module.exports = { ensureTicketPurchasePanel };
