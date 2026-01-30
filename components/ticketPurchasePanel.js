const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const { TICKET_BUNDLES } = require("../config/ticketBundles");

const TICKET_CHANNEL_ID = "1427041016808210442"; // Wallet channel
const PANEL_TITLE = "🎫 Purchase Tickets";

function ticketPurchaseButtons() {
  // Create buttons for ticket bundles (split into 2 rows: 3 + 2)
  const row1Bundles = TICKET_BUNDLES.slice(0, 3);
  const row2Bundles = TICKET_BUNDLES.slice(3);

  const row1 = new ActionRowBuilder().addComponents(
    ...row1Bundles.map((bundle) =>
      new ButtonBuilder()
        .setCustomId(`BUY_TICKETS_${bundle.id}`)
        .setLabel(
          `${bundle.emoji} ${bundle.tickets} - $${bundle.price.toFixed(2)}`
        )
        .setStyle(bundle.popular ? ButtonStyle.Success : ButtonStyle.Primary)
    )
  );

  const rows = [row1];

  if (row2Bundles.length > 0) {
    const row2 = new ActionRowBuilder().addComponents(
      ...row2Bundles.map((bundle) =>
        new ButtonBuilder()
          .setCustomId(`BUY_TICKETS_${bundle.id}`)
          .setLabel(
            `${bundle.emoji} ${bundle.tickets} - $${bundle.price.toFixed(2)}`
          )
          .setStyle(bundle.popular ? ButtonStyle.Success : ButtonStyle.Primary)
      )
    );
    rows.push(row2);
  }

  // Add "Convert Winnings to Tickets" button
  const convertRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("CONVERT_WINNINGS_TO_TICKETS")
      .setLabel("💰 Convert Winnings to Tickets")
      .setStyle(ButtonStyle.Success)
  );
  rows.push(convertRow);

  return rows;
}

function buildEmbed() {
  let bundleDesc =
    "**💳 Secure Ticket Purchases**\n" +
    "Buy tickets to enter skirmish matches and compete for cash prizes!\n\n" +
    "**Pricing Structure:**\n" +
    "• Entry fee (stake): $1.00 per ticket → goes to prize pool\n" +
    "• Platform fee: 35% → 20% (decreases with volume)\n" +
    "• Total = Entry fee + Platform fee\n\n" +
    "**📦 Available Bundles:**\n\n";

  TICKET_BUNDLES.forEach((bundle) => {
    const popularTag = bundle.popular ? " ⭐ **BEST VALUE**" : "";
    const feeReduction = bundle.serviceFeePercent < 35
      ? ` (${35 - bundle.serviceFeePercent}% off fee!)`
      : "";

    bundleDesc += `${bundle.emoji} **${bundle.label}**${popularTag}\n`;
    bundleDesc += `├ Entry fee (stake): **$${bundle.stake.toFixed(2)}** (${bundle.tickets} tickets @ $1.00)\n`;
    bundleDesc += `├ Platform fee: **$${bundle.serviceFee.toFixed(2)}** (${bundle.serviceFeePercent}% of stake)${feeReduction}\n`;
    bundleDesc += `└ **Total cost: $${bundle.price.toFixed(2)}**\n`;
    bundleDesc += `   *${bundle.description}*\n\n`;
  });

  bundleDesc += "\n**Match Entry Costs:**\n";
  bundleDesc += "• MM5: 5 tickets ($5.00 stake)\n";
  bundleDesc += "• MM10: 10 tickets ($10.00 stake)\n";
  bundleDesc += "• MM20: 20 tickets ($20.00 stake)\n";
  bundleDesc += "• MM50: 50 tickets ($50.00 stake)\n\n";
  bundleDesc += "💡 **Larger bundles = Lower platform fees!**\n";
  bundleDesc += "✅ Powered by Stripe - Fast & Secure";

  return new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(bundleDesc)
    .setColor(0x5865f2)
    .setFooter({ text: "Tickets are credited instantly • Stakes go to prize pools" })
    .setTimestamp(new Date());
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
      m.author.id === client.user.id && m.embeds?.[0]?.title === PANEL_TITLE
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
