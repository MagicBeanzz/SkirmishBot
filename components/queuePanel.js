// Components/queuePanel.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const QueueEntry = require("../models/QueueEntry");
const QueueState = require("../models/QueueState");
const TIERS = require("../config/tiers");

const BTN_VIEW_PRIZES = "VIEW_PRIZES";
const PANEL_TITLE = "🎮 Tournament Queue Panel";

/** Utility: compute prize for a given size & tier cost (20% cut) */
function prize(size, cost) {
  return (size * cost * 0.8).toFixed(2);
}

/** Build tier and utility buttons */
function buildTierButtons() {
  const rows = [];

  // All tier join buttons (T1, T5, T10, T20) on a single horizontal row
  const joinRow = new ActionRowBuilder().addComponents(
    ...TIERS.map((tier) =>
      new ButtonBuilder()
        .setCustomId(`JOIN_${tier.key}`)
        .setLabel(`Join ${tier.label}`)
        .setStyle(ButtonStyle.Primary)
    )
  );
  rows.push(joinRow);

  // Utility row: Leave / Refresh / View Prizes
  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("LEAVE_QUEUE")
      .setLabel("Leave Queue")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("REFRESH_PANEL")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(BTN_VIEW_PRIZES)
      .setLabel("View Prizes")
      .setStyle(ButtonStyle.Success)
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

/** Builds the queue panel embed with queue counts and prize preview */
async function buildPanelEmbed(serverId) {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Join a tournament tier below. Once enough players queue, a tournament and round 1 match will begin in new designated channels. (4 person bracket will start after 2 minutes if there are not 8 players)! " +
        "The fields below show the prizes for 4 and 8 person brackets."
    )
    .setTimestamp(new Date());

  for (const tier of TIERS) {
    const count = await QueueEntry.countDocuments({
      serverId,
      tierKey: tier.key,
    });
    const fourP = prize(4, tier.cost);
    const eightP = prize(8, tier.cost);

    embed.addFields({
      name: `${tier.label} — ${tier.cost}🎟️ / entry`,
      value:
        `Players queued: **${count}**\n` +
        `**Prizes**: 4p → **$${fourP}**, 8p → **$${eightP}**`,
      inline: true,
    });
  }

  return embed;
}

/** Ensure one panel message exists */
async function ensurePanel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(process.env.QUEUE_CHANNEL_ID);
  const embed = await buildPanelEmbed(guild.id);
  const components = buildTierButtons();

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
      console.warn("Failed to edit existing queue panel:", err);
    }
  }

  await channel.send({ embeds: [embed], components });
}

/** Refresh the queue panel */
async function refreshPanel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(process.env.QUEUE_CHANNEL_ID);

  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id && m.embeds?.[0]?.title === PANEL_TITLE
  );
  if (!existing) return;

  const embed = await buildPanelEmbed(guild.id);
  const components = buildTierButtons();
  await existing.edit({ embeds: [embed], components });
}

/** Handle queue panel–specific buttons (e.g., View Prizes) */
async function handleQueuePanelButton(interaction) {
  if (interaction.customId !== BTN_VIEW_PRIZES) return false;

  const lines = TIERS.map(
    (t) =>
      `**${t.label}** — ${t.cost}🎟️/entry\n` +
      `• 4 players: $${prize(4, t.cost)}\n` +
      `• 8 players: $${prize(8, t.cost)}`
  );

  await interaction.reply({
    ephemeral: true,
    content: "🏆 **Prize Preview**\n\n" + lines.join("\n\n"),
  });

  return true;
}

module.exports = { ensurePanel, refreshPanel, handleQueuePanelButton };
