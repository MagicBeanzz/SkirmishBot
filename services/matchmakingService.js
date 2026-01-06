const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const MatchmakingEntry = require("../models/MatchmakingEntry");
const MatchmakingMatch = require("../models/MatchmakingMatch");
const Profile = require("../models/profileSchema");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");

const MATCH_CATEGORY_ID = process.env.MATCH_CATEGORY_ID;
const VALORANT_MAPS = ["Skirmish A", "Skirmish B", "Skirmish C"];

/* ------------------------------ Helpers ---------------------------------- */

async function safeDisplayName(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m.displayName;
  } catch {
    return `Unknown (${userId})`;
  }
}

/* ------------------------------ Queue Management ----------------------------- */

/**
 * Add a player to the matchmaking queue
 * Uses transactions to prevent ticket loss if queue join fails
 * Returns { success: boolean, message: string, match?: MatchmakingMatch }
 */
async function joinMatchmaking(client, serverId, userId, tierKey) {
  const mongoose = require("mongoose");
  let session;

  try {
    const tier = MATCHMAKING_TIERS.find((t) => t.key === tierKey);
    if (!tier) {
      return { success: false, message: "❌ Invalid tier selected." };
    }

    // Check if player is in an active match
    const activeMatch = await MatchmakingMatch.findOne({
      serverId,
      $or: [{ player1Id: userId }, { player2Id: userId }],
      status: { $in: ["pickban", "playing"] },
    });
    if (activeMatch) {
      return {
        success: false,
        message: `❌ You're currently in an active match! Finish your current match before joining a new queue.`,
      };
    }

    // Check if already in queue
    const existing = await MatchmakingEntry.findOne({ serverId, userId });
    if (existing) {
      return {
        success: false,
        message: `❌ You're already in the **${MATCHMAKING_TIERS.find((t) => t.key === existing.tierKey)?.label}** matchmaking queue!`,
      };
    }

    // Check if player has enough tickets
    const profile = await Profile.findOne({ serverId, userId });
    if (!profile || profile.balance < tier.cost) {
      return {
        success: false,
        message: `❌ You need **${tier.cost}** tickets to join this tier. Use \`/balance\` to check your balance.`,
      };
    }

    // Start transaction for ticket deduction + queue join
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // Atomically deduct tickets
      const updatedProfile = await Profile.findOneAndUpdate(
        {
          serverId,
          userId,
          balance: { $gte: tier.cost }, // Only deduct if enough balance
        },
        {
          $inc: { balance: -tier.cost },
        },
        { session, new: true }
      );

      if (!updatedProfile) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // Add to queue
      await MatchmakingEntry.create(
        [
          {
            serverId,
            userId,
            tierKey,
            joinedAt: new Date(),
          },
        ],
        { session }
      );
    });

    await session.endSession();
    session = null;

    // Check if there's an opponent waiting (outside transaction)
    const opponent = await MatchmakingEntry.findOne({
      serverId,
      tierKey,
      userId: { $ne: userId },
    }).sort({ joinedAt: 1 });

    if (opponent) {
      // Found a match! Remove both from queue and create match
      // Use transaction to ensure both are removed atomically
      session = await mongoose.startSession();
      let matchData;

      await session.withTransaction(async () => {
        // Remove both from queue atomically
        const deleteResult = await MatchmakingEntry.deleteMany(
          {
            serverId,
            userId: { $in: [userId, opponent.userId] },
          },
          { session }
        );

        if (deleteResult.deletedCount !== 2) {
          throw new Error("QUEUE_REMOVAL_FAILED");
        }

        // Create match document (Discord channel created after transaction)
        const matchDoc = await MatchmakingMatch.create(
          [
            {
              serverId,
              tierKey,
              player1Id: userId,
              player2Id: opponent.userId,
              status: "pickban",
              pickBanState: {
                bannedMaps: [],
                selectedMap: null,
                currentAction: "p1_ban",
              },
            },
          ],
          { session }
        );

        matchData = matchDoc[0];
      });

      await session.endSession();
      session = null;

      // Create Discord channel (outside transaction since it's an external API call)
      try {
        const guild = client.guilds.cache.get(serverId);
        if (!guild) throw new Error("Guild not found");

        const p1Name = (await safeDisplayName(guild, userId))
          .slice(0, 10)
          .replace(/[^a-zA-Z0-9]/g, "");
        const p2Name = (await safeDisplayName(guild, opponent.userId))
          .slice(0, 10)
          .replace(/[^a-zA-Z0-9]/g, "");

        const channel = await guild.channels.create({
          name: `${tier.label}-${p1Name}-vs-${p2Name}`,
          type: ChannelType.GuildText,
          parent: MATCH_CATEGORY_ID,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: userId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
            {
              id: opponent.userId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });

        matchData.channelId = channel.id;
        await matchData.save();

        // Send initial pick/ban message
        const pickBanMessage = await sendInitialPickBanMessage(client, matchData);
        matchData.pickBanState.messageId = pickBanMessage.id;
        await matchData.save();

        return {
          success: true,
          message: `✅ Match found! Creating your match channel...`,
          match: matchData,
        };
      } catch (channelErr) {
        console.error("Error creating match channel:", channelErr);
        // If Discord channel creation fails, cancel the match and refund tickets
        await MatchmakingMatch.findByIdAndUpdate(matchData._id, { status: "cancelled" });

        // Refund both players
        await Profile.findOneAndUpdate({ serverId, userId }, { $inc: { balance: tier.cost } });
        await Profile.findOneAndUpdate({ serverId, userId: opponent.userId }, { $inc: { balance: tier.cost } });

        return {
          success: false,
          message: "❌ Failed to create match channel. Tickets have been refunded. Please try again.",
        };
      }
    } else {
      // Waiting for opponent
      return {
        success: true,
        message: `✅ Joined **${tier.label}** matchmaking! Waiting for an opponent...`,
      };
    }
  } catch (err) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      return {
        success: false,
        message: `❌ You need **${MATCHMAKING_TIERS.find((t) => t.key === tierKey)?.cost}** tickets to join this tier.`,
      };
    }
    if (err.message === "QUEUE_REMOVAL_FAILED") {
      return {
        success: false,
        message: "❌ Failed to match players. Please try joining queue again.",
      };
    }

    console.error("Error in joinMatchmaking:", err);
    return { success: false, message: "❌ An error occurred. Please try again." };
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

/**
 * Remove a player from the matchmaking queue
 */
async function leaveMatchmaking(serverId, userId) {
  try {
    const entry = await MatchmakingEntry.findOne({ serverId, userId });
    if (!entry) {
      return { success: false, message: "❌ You're not in the matchmaking queue." };
    }

    const tier = MATCHMAKING_TIERS.find((t) => t.key === entry.tierKey);

    // Refund tickets
    const profile = await Profile.findOne({ serverId, userId });
    if (profile) {
      profile.balance += tier.cost;
      await profile.save();
    }

    // Remove from queue
    await MatchmakingEntry.deleteOne({ serverId, userId });

    return {
      success: true,
      message: `✅ Left **${tier?.label || entry.tierKey}** matchmaking. **${tier.cost}** tickets refunded.`,
    };
  } catch (err) {
    console.error("Error in leaveMatchmaking:", err);
    return { success: false, message: "❌ An error occurred. Please try again." };
  }
}

/* ------------------------------ Match Creation ----------------------------- */

/**
 * Create a matchmaking match and private channel
 */
async function createMatch(client, serverId, tierKey, player1Id, player2Id) {
  try {
    const guild = client.guilds.cache.get(serverId);
    if (!guild) throw new Error("Guild not found");

    const tier = MATCHMAKING_TIERS.find((t) => t.key === tierKey);

    // Create match document
    const match = await MatchmakingMatch.create({
      serverId,
      tierKey,
      player1Id,
      player2Id,
      status: "pickban",
      pickBanState: {
        bannedMaps: [],
        selectedMap: null,
        currentAction: "p1_ban",
      },
    });

    // Create private match channel
    const p1Name = (await safeDisplayName(guild, player1Id))
      .slice(0, 10)
      .replace(/[^a-zA-Z0-9]/g, "");
    const p2Name = (await safeDisplayName(guild, player2Id))
      .slice(0, 10)
      .replace(/[^a-zA-Z0-9]/g, "");

    const channel = await guild.channels.create({
      name: `${tier.label}-${p1Name}-vs-${p2Name}`,
      type: ChannelType.GuildText,
      parent: MATCH_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: player1Id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: player2Id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    match.channelId = channel.id;
    await match.save();

    // Send initial pick/ban message
    const pickBanMessage = await sendInitialPickBanMessage(client, match);
    match.pickBanState.messageId = pickBanMessage.id;
    await match.save();

    return match;
  } catch (err) {
    console.error("Error creating match:", err);
    throw err;
  }
}

/* ------------------------------ Pick/Ban System ----------------------------- */

/**
 * Create pick/ban embed
 */
function createPickBanEmbed(match, tier) {
  const { bannedMaps, currentAction } = match.pickBanState;
  const availableMaps = VALORANT_MAPS.filter((m) => !bannedMaps.includes(m));

  let description = `🎮 **${tier.label} Matchmaking Match**\n\n`;
  description += `<@${match.player1Id}> vs <@${match.player2Id}>\n`;
  description += `💰 Prize: **$${tier.prize.toFixed(2)}**\n\n`;
  description += `**Available Maps:**\n`;
  availableMaps.forEach((map) => {
    description += `• ${map}\n`;
  });

  if (bannedMaps.length > 0) {
    description += `\n**Banned Maps:**\n`;
    bannedMaps.forEach((map) => {
      description += `~~${map}~~\n`;
    });
  }

  description += `\n`;
  if (currentAction === "p1_ban") {
    description += `🎯 <@${match.player1Id}>'s turn to ban a map`;
  } else if (currentAction === "p2_ban") {
    description += `🎯 <@${match.player2Id}>'s turn to ban a map`;
  } else if (currentAction === "p1_pick") {
    description += `🎯 <@${match.player1Id}>'s turn to pick the map`;
  }

  return new EmbedBuilder()
    .setTitle("🗺️ Map Pick/Ban Phase")
    .setDescription(description)
    .setColor(0x5865f2)
    .addFields(
      { name: "Player 1", value: `<@${match.player1Id}>`, inline: true },
      { name: "Player 2", value: `<@${match.player2Id}>`, inline: true }
    );
}

/**
 * Create map ban/pick buttons
 */
function createMapButtons(match) {
  const { bannedMaps } = match.pickBanState;
  const availableMaps = VALORANT_MAPS.filter((m) => !bannedMaps.includes(m));

  const buttons = availableMaps.map((map) =>
    new ButtonBuilder()
      .setCustomId(`MM_MAP_${match._id}_${map.replace(/\s/g, "_")}`)
      .setLabel(map)
      .setStyle(ButtonStyle.Danger)
  );

  if (buttons.length === 0) return [];

  return [new ActionRowBuilder().addComponents(buttons)];
}

/**
 * Send initial pick/ban message
 */
async function sendInitialPickBanMessage(client, match) {
  try {
    const guild = client.guilds.cache.get(match.serverId);
    const channel = await guild.channels.fetch(match.channelId);
    const tier = MATCHMAKING_TIERS.find((t) => t.key === match.tierKey);

    const embed = createPickBanEmbed(match, tier);
    const buttons = createMapButtons(match);

    const message = await channel.send({
      embeds: [embed],
      components: buttons,
    });

    return message;
  } catch (err) {
    console.error("Error sending initial pick/ban message:", err);
    throw err;
  }
}

/**
 * Handle map selection (ban or pick)
 * Uses interaction.update() to edit the original message instead of creating new ones
 */
async function handleMapSelection(client, matchId, map, userId, interaction) {
  try {
    const match = await MatchmakingMatch.findById(matchId);
    if (!match) {
      return { success: false, message: "❌ Match not found." };
    }

    const { currentAction, bannedMaps } = match.pickBanState;
    const tier = MATCHMAKING_TIERS.find((t) => t.key === match.tierKey);

    // Verify it's the correct player's turn
    if (
      (currentAction === "p1_ban" || currentAction === "p1_pick") &&
      userId !== match.player1Id
    ) {
      return { success: false, message: "❌ It's not your turn!" };
    }
    if (currentAction === "p2_ban" && userId !== match.player2Id) {
      return { success: false, message: "❌ It's not your turn!" };
    }

    // Check if map is valid
    if (!VALORANT_MAPS.includes(map)) {
      return { success: false, message: "❌ Invalid map selection." };
    }

    if (bannedMaps.includes(map)) {
      return { success: false, message: "❌ This map has already been banned." };
    }

    // Handle action
    if (currentAction.includes("ban")) {
      // Ban the map
      match.pickBanState.bannedMaps.push(map);

      // Check if we've banned 2 maps (only 1 remains) - auto-select it
      if (match.pickBanState.bannedMaps.length === 2) {
        const remainingMap = VALORANT_MAPS.find(
          (m) => !match.pickBanState.bannedMaps.includes(m)
        );

        // Auto-select the final map
        match.pickBanState.selectedMap = remainingMap;
        match.status = "playing";
        await match.save();

        // Update message to show final selection
        const guild = client.guilds.cache.get(match.serverId);
        const p1Name = await safeDisplayName(guild, match.player1Id);
        const p2Name = await safeDisplayName(guild, match.player2Id);

        const finalEmbed = new EmbedBuilder()
          .setTitle("✅ Map Selected!")
          .setDescription(
            `The match will be played on **${remainingMap}**\n\n` +
              `Good luck to both players!`
          )
          .setColor(0x57f287)
          .addFields(
            { name: "Player 1", value: `<@${match.player1Id}>`, inline: true },
            { name: "Player 2", value: `<@${match.player2Id}>`, inline: true },
            { name: "Map", value: remainingMap, inline: true }
          );

        await interaction.update({
          embeds: [finalEmbed],
          components: [],
        });

        // Send match reporting message
        const channel = await guild.channels.fetch(match.channelId);

        const reportEmbed = new EmbedBuilder()
          .setTitle("🎮 Match Starting!")
          .setDescription(
            `**Map:** ${remainingMap}\n\n` +
              `<@${match.player1Id}> vs <@${match.player2Id}>\n\n` +
              `Good luck! Report the match result when finished using the buttons below.`
          )
          .setColor(0x5865f2)
          .setTimestamp();

        const reportButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`MM_REPORT_WIN_${match._id}_${match.player1Id}`)
            .setLabel(`${p1Name} Won`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`MM_REPORT_WIN_${match._id}_${match.player2Id}`)
            .setLabel(`${p2Name} Won`)
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({
          content: "\n**🎮 Play your match now!**",
          embeds: [reportEmbed],
          components: [reportButtons],
        });

        return {
          success: true,
          message: `✅ **${remainingMap}** has been auto-selected! Match is starting...`,
        };
      }

      // Still need more bans
      if (currentAction === "p1_ban") {
        match.pickBanState.currentAction = "p2_ban";
      } else {
        match.pickBanState.currentAction = "p1_pick";
      }

      await match.save();

      // Update the message with new pick/ban state
      const embed = createPickBanEmbed(match, tier);
      const buttons = createMapButtons(match);

      await interaction.update({
        embeds: [embed],
        components: buttons,
      });

      return {
        success: true,
        message: `✅ **${map}** has been banned.`,
      };
    } else if (currentAction === "p1_pick") {
      // Pick the map
      match.pickBanState.selectedMap = map;
      match.status = "playing";
      await match.save();

      // Update message to show final selection
      const guild = client.guilds.cache.get(match.serverId);
      const p1Name = await safeDisplayName(guild, match.player1Id);
      const p2Name = await safeDisplayName(guild, match.player2Id);

      const finalEmbed = new EmbedBuilder()
        .setTitle("✅ Map Selected!")
        .setDescription(
          `The match will be played on **${map}**\n\n` +
            `Good luck to both players!`
        )
        .setColor(0x57f287)
        .addFields(
          { name: "Player 1", value: `<@${match.player1Id}>`, inline: true },
          { name: "Player 2", value: `<@${match.player2Id}>`, inline: true },
          { name: "Map", value: map, inline: true }
        );

      await interaction.update({
        embeds: [finalEmbed],
        components: [],
      });

      // Send match reporting message
      const channel = await guild.channels.fetch(match.channelId);

      const reportEmbed = new EmbedBuilder()
        .setTitle("🎮 Match Starting!")
        .setDescription(
          `**Map:** ${map}\n\n` +
            `<@${match.player1Id}> vs <@${match.player2Id}>\n\n` +
            `Good luck! Report the match result when finished using the buttons below.`
        )
        .setColor(0x5865f2)
        .setTimestamp();

      const reportButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`MM_REPORT_WIN_${match._id}_${match.player1Id}`)
          .setLabel(`${p1Name} Won`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`MM_REPORT_WIN_${match._id}_${match.player2Id}`)
          .setLabel(`${p2Name} Won`)
          .setStyle(ButtonStyle.Success)
      );

      await channel.send({
        content: "\n**🎮 Play your match now!**",
        embeds: [reportEmbed],
        components: [reportButtons],
      });

      return {
        success: true,
        message: `✅ **${map}** has been selected! Match is starting...`,
      };
    }
  } catch (err) {
    console.error("Error handling map selection:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

/* ------------------------------ Match Reporting ----------------------------- */

/**
 * Report match result (requires confirmation from opponent)
 * Uses atomic operations to prevent race conditions
 */
async function reportMatchResult(client, matchId, winnerId, reporterId, interaction) {
  try {
    const MatchmakingReport = require("../models/MatchmakingReport");

    const match = await MatchmakingMatch.findById(matchId);
    if (!match) {
      return { success: false, message: "❌ Match not found." };
    }

    if (match.winnerId) {
      return { success: false, message: "❌ This match has already been completed." };
    }

    if (reporterId !== match.player1Id && reporterId !== match.player2Id) {
      return { success: false, message: "❌ You're not part of this match." };
    }

    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      return { success: false, message: "❌ Invalid winner." };
    }

    // Use atomic findOneAndUpdate to prevent race conditions
    // Only update if no report exists OR report has no winner yet
    const existingReport = await MatchmakingReport.findOne({ matchId: matchId.toString() });

    // Check if there's already a report with a different winner (race condition detected)
    if (existingReport && existingReport.reportedWinnerId) {
      if (existingReport.reportedWinnerId === winnerId) {
        return {
          success: false,
          message: "❌ This result has already been reported. Waiting for confirmation.",
        };
      } else {
        // Different winner reported - automatic dispute
        existingReport.disputed = true;
        await existingReport.save();

        return {
          success: false,
          message: "❌ Conflicting reports detected. This match has been flagged for admin review.",
        };
      }
    }

    // Try to create report atomically (prevents duplicate reports due to unique constraint)
    let report;
    try {
      if (!existingReport) {
        report = await MatchmakingReport.create({
          matchId: matchId.toString(),
          reportedWinnerId: winnerId,
          reportedBy: reporterId,
        });
      } else {
        // Update existing empty report
        report = existingReport;
        report.reportedWinnerId = winnerId;
        report.reportedBy = reporterId;
        await report.save();
      }
    } catch (err) {
      // Handle race condition where both players report at exact same time
      if (err.code === 11000) {
        // Duplicate key error - report already exists
        const conflictReport = await MatchmakingReport.findOne({ matchId: matchId.toString() });
        if (conflictReport && conflictReport.reportedWinnerId !== winnerId) {
          // Different winner - flag dispute
          conflictReport.disputed = true;
          await conflictReport.save();
          return {
            success: false,
            message: "❌ Conflicting reports detected. This match has been flagged for admin review.",
          };
        }
        return {
          success: false,
          message: "❌ A result has already been reported for this match.",
        };
      }
      throw err;
    }

    // Determine loser for confirmation message
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

    // Update the message with confirmation buttons
    const embed = new EmbedBuilder()
      .setTitle("⏳ Win Report Pending Confirmation")
      .setDescription(
        `<@${reporterId}> reported that <@${winnerId}> won.\n\n` +
          `Waiting for confirmation from <@${loserId}>...`
      )
      .setColor(0xfee75c)
      .setFooter({ text: "The opponent must confirm or dispute this result" });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`MM_CONFIRM_WIN_${matchId}_${winnerId}`)
        .setLabel("Confirm Result")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`MM_DISPUTE_WIN_${matchId}`)
        .setLabel("Dispute Result")
        .setStyle(ButtonStyle.Danger)
    );

    // Update the original message with confirmation interface
    await interaction.message.edit({
      embeds: [embed],
      components: [buttons],
    });

    return {
      success: true,
      message: `✅ Result reported. Waiting for <@${loserId}> to confirm.`,
    };
  } catch (err) {
    console.error("Error reporting match result:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

/**
 * Confirm match result and award prize
 * Uses MongoDB transactions to prevent race conditions and ensure atomic operations
 */
async function confirmMatchResult(client, matchId, winnerId, confirmerId) {
  const mongoose = require("mongoose");
  const session = await mongoose.startSession();

  try {
    const MatchmakingReport = require("../models/MatchmakingReport");

    // Start transaction
    const result = await session.withTransaction(async () => {
      // Fetch match with session
      const match = await MatchmakingMatch.findById(matchId).session(session);
      if (!match) {
        throw new Error("MATCH_NOT_FOUND");
      }

      // Check if match already completed (prevents double-confirmation)
      if (match.winnerId) {
        throw new Error("MATCH_ALREADY_COMPLETED");
      }

      const report = await MatchmakingReport.findOne({ matchId: matchId.toString() }).session(session);
      if (!report || !report.reportedWinnerId) {
        throw new Error("NO_REPORT");
      }

      // Check if report is disputed
      if (report.disputed) {
        throw new Error("MATCH_DISPUTED");
      }

      if (confirmerId === report.reportedBy) {
        throw new Error("CANNOT_CONFIRM_OWN_REPORT");
      }

      if (![match.player1Id, match.player2Id].includes(confirmerId)) {
        throw new Error("NOT_A_PARTICIPANT");
      }

      // Verify winner matches the report
      if (winnerId !== report.reportedWinnerId) {
        throw new Error("WINNER_MISMATCH");
      }

      // Atomically update match to completed state
      // This prevents double-confirmation if called concurrently
      const updatedMatch = await MatchmakingMatch.findOneAndUpdate(
        {
          _id: matchId,
          winnerId: null, // Only update if winnerId is still null
        },
        {
          $set: {
            winnerId: winnerId,
            status: "completed",
            completedAt: new Date(),
          },
        },
        { session, new: true }
      );

      if (!updatedMatch) {
        // Match was already completed by another concurrent request
        throw new Error("MATCH_ALREADY_COMPLETED");
      }

      // Mark report as confirmed
      report.confirmed = true;
      await report.save({ session });

      // Award prize to winner atomically
      const tier = MATCHMAKING_TIERS.find((t) => t.key === match.tierKey);
      const profileUpdate = await Profile.findOneAndUpdate(
        {
          serverId: match.serverId,
          userId: winnerId,
        },
        {
          $inc: { winningsBalance: tier.prize },
        },
        { session, new: true, upsert: true }
      );

      if (!profileUpdate) {
        throw new Error("PROFILE_UPDATE_FAILED");
      }

      return { match: updatedMatch, tier, loserId: winnerId === match.player1Id ? match.player2Id : match.player1Id };
    });

    // Transaction succeeded - now do non-critical operations outside transaction
    const { match, tier, loserId } = result;

    // Record match stats (non-critical)
    try {
      const { recordMatchResult, recordMatchmakingWin } = require("./statsService");
      await recordMatchResult(match.serverId, winnerId, loserId);
      await recordMatchmakingWin(match.serverId, winnerId, tier.prize);
    } catch (err) {
      console.error("Error recording match stats:", err);
    }

    // Log match result (non-critical)
    try {
      const { logMatchmakingResult } = require("./matchLogger");
      await logMatchmakingResult(client, match, winnerId, tier);
    } catch (err) {
      console.error("Error logging matchmaking result:", err);
    }

    // Refresh leaderboard (non-critical)
    try {
      const { refreshLeaderboard } = require("../components/leaderboardPanel");
      await refreshLeaderboard(client);
    } catch (err) {
      console.error("Error refreshing leaderboard:", err);
    }

    // Send completion message
    const guild = client.guilds.cache.get(match.serverId);
    const channel = await guild.channels.fetch(match.channelId);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Match Complete!")
      .setDescription(
        `**Winner:** <@${winnerId}>\n` +
          `**Opponent:** <@${loserId}>\n\n` +
          `💰 **$${tier.prize.toFixed(2)}** has been added to winner's balance!\n\n` +
          `This channel will be archived shortly.`
      )
      .setColor(0x57f287)
      .setTimestamp();

    await channel.send({ embeds: [embed], components: [] });

    // Archive channel after 30 seconds
    setTimeout(async () => {
      try {
        await channel.delete();
      } catch (err) {
        console.error("Error deleting match channel:", err);
      }
    }, 30000);

    return {
      success: true,
      message: `✅ Match completed! <@${winnerId}> wins $${tier.prize.toFixed(2)}!`,
    };
  } catch (err) {
    // Handle specific error cases
    if (err.message === "MATCH_NOT_FOUND") {
      return { success: false, message: "❌ Match not found." };
    }
    if (err.message === "MATCH_ALREADY_COMPLETED") {
      return { success: false, message: "❌ This match has already been completed." };
    }
    if (err.message === "NO_REPORT") {
      return { success: false, message: "❌ No report to confirm." };
    }
    if (err.message === "MATCH_DISPUTED") {
      return { success: false, message: "❌ This match is disputed and requires admin review." };
    }
    if (err.message === "CANNOT_CONFIRM_OWN_REPORT") {
      return {
        success: false,
        message: "❌ You cannot confirm your own report. Wait for your opponent to confirm.",
      };
    }
    if (err.message === "NOT_A_PARTICIPANT") {
      return {
        success: false,
        message: "❌ Only participants in this match can confirm the result.",
      };
    }
    if (err.message === "WINNER_MISMATCH") {
      return { success: false, message: "❌ Winner ID mismatch. Please report to an admin." };
    }

    console.error("Error confirming match result:", err);
    return { success: false, message: "❌ An error occurred while confirming the match." };
  } finally {
    await session.endSession();
  }
}

/**
 * Dispute match result - requires admin intervention
 */
async function disputeMatchResult(client, matchId, disputerId) {
  try {
    const MatchmakingReport = require("../models/MatchmakingReport");

    const match = await MatchmakingMatch.findById(matchId);
    if (!match) {
      return { success: false, message: "❌ Match not found." };
    }

    const report = await MatchmakingReport.findOne({ matchId: matchId.toString() });
    if (!report || !report.reportedWinnerId) {
      return { success: false, message: "❌ No report to dispute." };
    }

    if (![match.player1Id, match.player2Id].includes(disputerId)) {
      return {
        success: false,
        message: "❌ Only participants in this match can dispute the result.",
      };
    }

    // Mark as disputed
    report.disputed = true;
    await report.save();

    return {
      success: true,
      message: "✅ Result disputed. An admin will review this match.",
    };
  } catch (err) {
    console.error("Error disputing match result:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

/**
 * Create a match from an accepted challenge
 * This is a wrapper for createMatch specifically for the challenge system
 */
async function createMatchFromChallenge(client, serverId, player1Id, player2Id, tierKey) {
  try {
    const match = await createMatch(client, serverId, tierKey, player1Id, player2Id);
    return { success: true, match };
  } catch (err) {
    console.error("Error creating match from challenge:", err);
    return { success: false, message: "❌ Failed to create match." };
  }
}

module.exports = {
  joinMatchmaking,
  leaveMatchmaking,
  handleMapSelection,
  reportMatchResult,
  confirmMatchResult,
  disputeMatchResult,
  createMatchFromChallenge,
};
