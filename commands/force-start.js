// commands/force-start.js
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { refreshPanel } = require("../Components/queuePanel");
const QueueEntry = require("../models/QueueEntry");
const Profile = require("../models/profileSchema");
const TIERS = require("../config/tiers");
const { MIN_START, UPGRADE_SIZE } = require("../config/tiers");
const { createTournament } = require("../services/tournamentService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("force-start")
    .setDescription(
      "Force start a tournament for a specific tier (charges tickets now)."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("tier")
        .setDescription("Which tier to start?")
        .setRequired(true)
        .addChoices(
          { name: "Tier 1", value: "T1" },
          { name: "Tier 5", value: "T5" },
          { name: "Tier 10", value: "T10" },
          { name: "Tier 20", value: "T20" }
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("size")
        .setDescription("Bracket size (4 or 8). Default: auto.")
        .addChoices(
          { name: "4 players", value: 4 },
          { name: "8 players", value: 8 }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const serverId = interaction.guild.id;
    const tierKey = interaction.options.getString("tier");
    const requestedSize = interaction.options.getInteger("size");
    const tier = TIERS.find((t) => t.key === tierKey);

    if (!tier) {
      return interaction.editReply("Unknown tier.");
    }

    const totalCount = await QueueEntry.countDocuments({ serverId, tierKey });
    if (totalCount < MIN_START) {
      return interaction.editReply(
        `Not enough players to form a bracket (need at least ${MIN_START}).`
      );
    }

    const targetSize = requestedSize || (totalCount >= UPGRADE_SIZE ? 8 : 4);

    // Fetch candidates (a bit extra in case some can't pay)
    const candidates = await QueueEntry.find({ serverId, tierKey })
      .sort({ joinedAt: 1 })
      .limit(Math.max(targetSize * 2, targetSize + 4));

    // Build eligible by checking balances
    const eligible = [];
    for (const entry of candidates) {
      if (eligible.length >= targetSize) break;
      const profile = await Profile.findOne({
        serverId,
        userId: entry.userId,
      });
      if ((profile?.balance ?? 0) >= tier.cost) {
        eligible.push({ entry, profile });
      }
    }

    // Ensure even count and minimum size
    while (eligible.length > targetSize) eligible.pop();
    if (eligible.length % 2 === 1) eligible.pop();

    if (eligible.length < MIN_START) {
      return interaction.editReply(
        "Not enough eligible (funded) players to form a bracket right now."
      );
    }

    // Charge selected players & delete only their queue entries
    const userIds = [];
    for (const { entry, profile } of eligible) {
      profile.balance = Math.max(0, (profile.balance ?? 0) - tier.cost);
      await profile.save();
      userIds.push(entry.userId);
    }

    await QueueEntry.deleteMany({
      _id: { $in: eligible.map((e) => e.entry._id) },
    });

    // Start the tournament
    const size = eligible.length;
    await createTournament(
      interaction.client,
      serverId,
      tierKey,
      size,
      userIds
    );
    await refreshPanel(interaction.client);

    return interaction.editReply(
      `✅ Forced start successful: **${tierKey}** tournament with **${size}** players. Tickets were charged on start.`
    );
  },
};
