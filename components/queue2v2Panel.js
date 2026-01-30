// Components/queue2v2Panel.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const QueueEntry2v2 = require("../models/QueueEntry2v2");
const Team = require("../models/Team");
const TIERS = require("../config/tiers");

const QUEUE_2V2_CHANNEL_ID = "1436899212804620288";
const PANEL_TITLE = "👥 2v2 Wingman Queue";

/** Utility: compute prize for a given size & tier cost (100% to winner) */
function prize(size, cost) {
  // size = number of TEAMS, each team has 2 players
  const totalPlayers = size * 2;
  const totalEntry = totalPlayers * cost;
  return (totalEntry * 1.0).toFixed(2);
}

/** Build tier buttons for 2v2 */
function build2v2TierButtons() {
  const rows = [];

  // All tier join buttons
  const joinRow = new ActionRowBuilder().addComponents(
    ...TIERS.map((tier) =>
      new ButtonBuilder()
        .setCustomId(`JOIN_2V2_${tier.key}`)
        .setLabel(`Join ${tier.label}`)
        .setStyle(ButtonStyle.Primary)
    )
  );
  rows.push(joinRow);

  // Utility row
  const utilRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("LEAVE_2V2_QUEUE")
      .setLabel("Leave Queue")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("REFRESH_2V2_PANEL")
      .setLabel("Refresh")
      .setStyle(ButtonStyle.Secondary)
  );
  rows.push(utilRow);

  return rows;
}

/** Build the 2v2 panel embed */
async function build2v2PanelEmbed(serverId) {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "**🎮 2v2 Wingman Mode**\n\n" +
        "Form a team with a partner or queue solo to be auto-paired!\n\n" +
        "**📝 How to Play:**\n" +
        "1. Create a team: `/team create name:YourTeamName`\n" +
        "2. (Optional) Invite partner: `/team invite @friend`\n" +
        "3. Click a tier button below to join queue\n" +
        "4. Both players are charged tickets when tournament starts. When at least 2 teams join a queue, the tourney will start automatically in 30 seconds.\n\n" +
        "**💰 Prize Info Below:**"
    )
    .setColor(0x5865f2)
    .setTimestamp(new Date());

  // Get queue counts per tier
  for (const tier of TIERS) {
    const entries = await QueueEntry2v2.find({ serverId, tierKey: tier.key });
    const teams = await Promise.all(
      entries.map((e) => Team.findById(e.teamId))
    );

    const teamCount = teams.filter((t) => t).length;
    const soloCount = teams.filter((t) => t && !t.partnerId).length;
    const duoCount = teams.filter((t) => t && t.partnerId).length;

    // Calculate prizes (2 teams = 4 players minimum)
    const prize2Teams = prize(2, tier.cost); // 4 players
    const prize4Teams = prize(4, tier.cost); // 8 players

    embed.addFields({
      name: `${tier.label} — ${tier.cost}🎟️ per player`,
      value:
        `**Queued:** ${teamCount} teams (${soloCount} solo, ${duoCount} duos)\n` +
        `**Prizes:** 2 teams → **$${prize2Teams}**, 4 teams → **$${prize4Teams}**`,
      inline: true,
    });
  }

  return embed;
}

/** Ensure one 2v2 panel exists */
async function ensure2v2Panel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(QUEUE_2V2_CHANNEL_ID);
  const embed = await build2v2PanelEmbed(guild.id);
  const components = build2v2TierButtons();

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
      console.warn("Failed to edit existing 2v2 queue panel:", err);
    }
  }

  await channel.send({ embeds: [embed], components });
}

/** Refresh the 2v2 panel */
async function refresh2v2Panel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(QUEUE_2V2_CHANNEL_ID);

  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id && m.embeds?.[0]?.title === PANEL_TITLE
  );

  if (!existing) return;

  const embed = await build2v2PanelEmbed(guild.id);
  const components = build2v2TierButtons();
  await existing.edit({ embeds: [embed], components });
}

module.exports = { ensure2v2Panel, refresh2v2Panel };
