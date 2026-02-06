const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const MatchmakingEntry = require("../models/MatchmakingEntry");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");

const MATCHMAKING_CHANNEL_ID = "1457148385533362428";
const PANEL_TITLE = "⚔️ 1v1 MATCHMAKING";

let matchmakingMessageId = null;

// Color-coded tier emojis
const TIER_STYLES = {
  MM5: { emoji: "🟢", color: "Green", name: "$5 Skirmish" },
  MM10: { emoji: "🟡", color: "Yellow", name: "$10 Battle" },
  MM20: { emoji: "🟠", color: "Orange", name: "$20 Clash" },
  MM50: { emoji: "🔴", color: "Red", name: "$50 War" },
};

/**
 * Build tier buttons with queue status indicators
 */
async function buildTierButtons(serverId) {
  const rows = [];

  // Get queue counts for all tiers
  const queueCounts = {};
  for (const tier of MATCHMAKING_TIERS) {
    queueCounts[tier.key] = await MatchmakingEntry.countDocuments({
      serverId,
      tierKey: tier.key,
    });
  }

  // Row 1: All tier buttons on one row
  const tierRow = new ActionRowBuilder().addComponents(
    ...MATCHMAKING_TIERS.map((tier) => {
      const style = TIER_STYLES[tier.key];
      const count = queueCounts[tier.key];
      const label = count > 0
        ? `${style.emoji} $${tier.prize} • ${count} in queue`
        : `${style.emoji} WIN $${tier.prize}`;

      return new ButtonBuilder()
        .setCustomId(`MM_JOIN_${tier.key}`)
        .setLabel(label)
        .setStyle(count > 0 ? ButtonStyle.Success : ButtonStyle.Primary);
    })
  );
  rows.push(tierRow);

  // Row 2: Leave Queue + Refresh (secondary style)
  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("MM_LEAVE_QUEUE")
      .setLabel("Leave Queue")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("MM_REFRESH_PANEL")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(utilRow);

  // Row 3: External links
  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("📜 Rules")
      .setStyle(ButtonStyle.Link)
      .setURL(
        "https://discord.com/channels/1427022339362783242/1427035861362409602"
      ),
    new ButtonBuilder()
      .setLabel("💵 How Payouts Work")
      .setStyle(ButtonStyle.Link)
      .setURL(
        "https://discord.com/channels/1427022339362783242/1429134493750395051"
      )
  );
  rows.push(linkRow);

  return rows;
}

/**
 * Build the matchmaking panel embed with clean, prize-forward design
 */
async function buildPanelEmbed(serverId) {
  // Get queue counts
  const queueCounts = {};
  for (const tier of MATCHMAKING_TIERS) {
    queueCounts[tier.key] = await MatchmakingEntry.countDocuments({
      serverId,
      tierKey: tier.key,
    });
  }

  // Build tier table as single formatted text
  let tierTable = "";
  for (const tier of MATCHMAKING_TIERS) {
    const style = TIER_STYLES[tier.key];
    const count = queueCounts[tier.key];

    tierTable += `${style.emoji} **${style.name}**  →  💰 **$${tier.prize}**  (🎟️ ${tier.cost} tickets)`;

    if (count > 0) {
      tierTable += `  ⏳ *${count} waiting*`;
    }
    tierTable += "\n";
  }

  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "**Join a 1v1 queue. Vandal/Phantom only. Winner takes all.**\n\n" +
      tierTable
    )
    .setColor(0xff4654)
    .setTimestamp(new Date());

  return embed;
}

/**
 * Build the full matchmaking panel message
 */
async function buildMatchmakingPanel(serverId) {
  const embed = await buildPanelEmbed(serverId);
  const components = await buildTierButtons(serverId);

  return { embeds: [embed], components };
}

/**
 * Ensure the matchmaking panel exists in the designated channel
 */
async function ensureMatchmakingPanel(client) {
  try {
    const serverId = process.env.GUILD_ID;
    const channel = await client.channels.fetch(MATCHMAKING_CHANNEL_ID);

    if (!channel) {
      console.error("❌ Matchmaking channel not found!");
      return;
    }

    // Search for existing panel message from the bot
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      const existingPanel = messages.find(
        (msg) =>
          msg.author.id === client.user.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title === PANEL_TITLE
      );

      if (existingPanel) {
        // Update existing message
        const panelData = await buildMatchmakingPanel(serverId);
        await existingPanel.edit(panelData);
        matchmakingMessageId = existingPanel.id;
        console.log(`✅ Matchmaking panel updated: ${existingPanel.id}`);
        return;
      }
    } catch (err) {
      console.log("Could not fetch existing messages, creating new panel...");
    }

    // Create new panel if no existing one found
    const panelData = await buildMatchmakingPanel(serverId);
    const message = await channel.send(panelData);
    matchmakingMessageId = message.id;
    console.log(`✅ Matchmaking panel created: ${message.id}`);
  } catch (err) {
    console.error("❌ Error ensuring matchmaking panel:", err);
  }
}

/**
 * Refresh the matchmaking panel (update queue counts)
 */
async function refreshMatchmakingPanel(client) {
  try {
    const serverId = process.env.GUILD_ID;
    const channel = await client.channels.fetch(MATCHMAKING_CHANNEL_ID);

    if (!channel) {
      console.error("❌ Matchmaking channel not found!");
      return;
    }

    // Find the panel message
    const messages = await channel.messages.fetch({ limit: 10 });
    const panel = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === PANEL_TITLE
    );

    if (panel) {
      const panelData = await buildMatchmakingPanel(serverId);
      await panel.edit(panelData);
    }
  } catch (err) {
    console.error("❌ Error refreshing matchmaking panel:", err);
  }
}

module.exports = {
  MATCHMAKING_CHANNEL_ID,
  TIER_STYLES,
  ensureMatchmakingPanel,
  refreshMatchmakingPanel,
  buildMatchmakingPanel,
};
