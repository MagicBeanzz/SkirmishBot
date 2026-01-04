const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const MatchmakingEntry = require("../models/MatchmakingEntry");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");

const MATCHMAKING_CHANNEL_ID = "1457148385533362428";
const PANEL_TITLE = "⚔️ 1v1 Matchmaking";

let matchmakingMessageId = null;

/**
 * Build tier buttons for matchmaking
 */
function buildTierButtons() {
  const rows = [];

  // All tier join buttons on a single horizontal row
  const joinRow = new ActionRowBuilder().addComponents(
    ...MATCHMAKING_TIERS.map((tier) =>
      new ButtonBuilder()
        .setCustomId(`MM_JOIN_${tier.key}`)
        .setLabel(`${tier.label} ($${tier.prize})`)
        .setStyle(ButtonStyle.Primary)
    )
  );
  rows.push(joinRow);

  // Utility row: Leave / Refresh
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

  // External info links
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
 * Build the matchmaking panel embed with queue counts
 */
async function buildPanelEmbed(serverId) {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Join a 1v1 matchmaking tier below. Once another player joins the same tier, " +
        "a private match channel will be created with map pick/ban. Winner takes the prize!"
    )
    .setColor(0xff4654)
    .setTimestamp(new Date());

  for (const tier of MATCHMAKING_TIERS) {
    const count = await MatchmakingEntry.countDocuments({
      serverId,
      tierKey: tier.key,
    });

    embed.addFields({
      name: `${tier.label} — ${tier.cost}🎟️ entry`,
      value: `Players queued: **${count}**\n💰 Prize: **$${tier.prize.toFixed(2)}**`,
      inline: true,
    });
  }

  return embed;
}

/**
 * Build the full matchmaking panel message
 */
async function buildMatchmakingPanel(serverId) {
  const embed = await buildPanelEmbed(serverId);
  const components = buildTierButtons();

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
  ensureMatchmakingPanel,
  refreshMatchmakingPanel,
  buildMatchmakingPanel,
};
