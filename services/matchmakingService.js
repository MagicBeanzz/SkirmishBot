const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const MatchmakingEntry = require("../models/MatchmakingEntry");
const MatchmakingMatch = require("../models/MatchmakingMatch");
const Profile = require("../models/profileSchema");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");

const MATCHMAKING_CATEGORY_ID = process.env.MATCHMAKING_CATEGORY_ID;
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
 * Returns { success: boolean, message: string, match?: MatchmakingMatch }
 */
async function joinMatchmaking(client, serverId, userId, tierKey) {
  try {
    const tier = MATCHMAKING_TIERS.find((t) => t.key === tierKey);
    if (!tier) {
      return { success: false, message: "❌ Invalid tier selected." };
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

    // Deduct tickets
    profile.balance -= tier.cost;
    await profile.save();

    // Add to queue
    await MatchmakingEntry.create({
      serverId,
      userId,
      tierKey,
      joinedAt: new Date(),
    });

    // Check if there's an opponent waiting
    const opponent = await MatchmakingEntry.findOne({
      serverId,
      tierKey,
      userId: { $ne: userId },
    }).sort({ joinedAt: 1 });

    if (opponent) {
      // Found a match! Remove both from queue and create match
      await MatchmakingEntry.deleteMany({
        serverId,
        userId: { $in: [userId, opponent.userId] },
      });

      // Create the match
      const match = await createMatch(client, serverId, tierKey, userId, opponent.userId);

      return {
        success: true,
        message: `✅ Match found! Creating your match channel...`,
        match,
      };
    } else {
      // Waiting for opponent
      return {
        success: true,
        message: `✅ Joined **${tier.label}** matchmaking! Waiting for an opponent...`,
      };
    }
  } catch (err) {
    console.error("Error in joinMatchmaking:", err);
    return { success: false, message: "❌ An error occurred. Please try again." };
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
      parent: MATCHMAKING_CATEGORY_ID,
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

    // Send match info and start pick/ban
    await sendPickBanMessage(client, match);

    // Notify players
    await channel.send(
      `🎮 **${tier.label} Matchmaking Match**\n\n` +
        `<@${player1Id}> vs <@${player2Id}>\n\n` +
        `💰 Prize: **$${tier.prize.toFixed(2)}**\n\n` +
        `Starting map pick/ban phase...`
    );

    return match;
  } catch (err) {
    console.error("Error creating match:", err);
    throw err;
  }
}

/* ------------------------------ Pick/Ban System ----------------------------- */

/**
 * Send or update pick/ban message
 */
async function sendPickBanMessage(client, match) {
  try {
    const guild = client.guilds.cache.get(match.serverId);
    const channel = await guild.channels.fetch(match.channelId);

    const { bannedMaps, currentAction } = match.pickBanState;
    const availableMaps = VALORANT_MAPS.filter((m) => !bannedMaps.includes(m));

    let description = `**Map Pick/Ban Phase**\n\n`;
    description += `Banned: ${bannedMaps.length > 0 ? bannedMaps.join(", ") : "None"}\n\n`;

    if (currentAction === "p1_ban") {
      description += `<@${match.player1Id}> - Ban a map`;
    } else if (currentAction === "p2_ban") {
      description += `<@${match.player2Id}> - Ban a map`;
    } else if (currentAction === "p1_pick") {
      description += `<@${match.player1Id}> - Pick the map`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🗺️ Map Selection")
      .setDescription(description)
      .setColor(0x5865f2)
      .setTimestamp();

    // Create map buttons
    const rows = [];
    let currentRow = new ActionRowBuilder();

    availableMaps.forEach((map, index) => {
      if (index > 0 && index % 5 === 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`mm_map_${match._id}_${map}`)
          .setLabel(map)
          .setStyle(ButtonStyle.Primary)
      );
    });

    if (currentRow.components.length > 0) {
      rows.push(currentRow);
    }

    await channel.send({
      embeds: [embed],
      components: rows,
    });
  } catch (err) {
    console.error("Error sending pick/ban message:", err);
  }
}

/**
 * Handle map selection (ban or pick)
 */
async function handleMapSelection(client, matchId, map, userId) {
  try {
    const match = await MatchmakingMatch.findById(matchId);
    if (!match) {
      return { success: false, message: "❌ Match not found." };
    }

    const { currentAction, bannedMaps } = match.pickBanState;

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

    // Handle action
    if (currentAction.includes("ban")) {
      // Ban the map
      match.pickBanState.bannedMaps.push(map);

      if (currentAction === "p1_ban") {
        match.pickBanState.currentAction = "p2_ban";
      } else {
        match.pickBanState.currentAction = "p1_pick";
      }

      await match.save();

      // Send next pick/ban message
      await sendPickBanMessage(client, match);

      return {
        success: true,
        message: `✅ **${map}** has been banned.`,
      };
    } else if (currentAction === "p1_pick") {
      // Pick the map
      match.pickBanState.selectedMap = map;
      match.status = "playing";
      await match.save();

      // Send match start message
      const guild = client.guilds.cache.get(match.serverId);
      const channel = await guild.channels.fetch(match.channelId);

      const p1Name = await safeDisplayName(guild, match.player1Id);
      const p2Name = await safeDisplayName(guild, match.player2Id);

      const embed = new EmbedBuilder()
        .setTitle("🎮 Match Starting!")
        .setDescription(
          `**Map:** ${map}\n\n` +
            `<@${match.player1Id}> vs <@${match.player2Id}>\n\n` +
            `Good luck! Report the match result when finished using the buttons below.`
        )
        .setColor(0x57f287)
        .setTimestamp();

      const buttons = new ActionRowBuilder().addComponents(
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
        embeds: [embed],
        components: [buttons],
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

    // Check if report already exists
    let report = await MatchmakingReport.findOne({ matchId: matchId.toString() });

    if (report && report.reportedWinnerId) {
      return {
        success: false,
        message: "❌ A result has already been reported for this match. Waiting for confirmation.",
      };
    }

    // Create or update report
    if (!report) {
      report = await MatchmakingReport.create({
        matchId: matchId.toString(),
        reportedWinnerId: winnerId,
        reportedBy: reporterId,
      });
    } else {
      report.reportedWinnerId = winnerId;
      report.reportedBy = reporterId;
      await report.save();
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
 */
async function confirmMatchResult(client, matchId, winnerId, confirmerId) {
  try {
    const MatchmakingReport = require("../models/MatchmakingReport");

    const match = await MatchmakingMatch.findById(matchId);
    if (!match) {
      return { success: false, message: "❌ Match not found." };
    }

    const report = await MatchmakingReport.findOne({ matchId: matchId.toString() });
    if (!report || !report.reportedWinnerId) {
      return { success: false, message: "❌ No report to confirm." };
    }

    if (confirmerId === report.reportedBy) {
      return {
        success: false,
        message: "❌ You cannot confirm your own report. Wait for your opponent to confirm.",
      };
    }

    if (![match.player1Id, match.player2Id].includes(confirmerId)) {
      return {
        success: false,
        message: "❌ Only participants in this match can confirm the result.",
      };
    }

    // Mark report as confirmed
    report.confirmed = true;
    await report.save();

    // Update match
    match.winnerId = winnerId;
    match.status = "completed";
    match.completedAt = new Date();
    await match.save();

    // Award prize to winner
    const tier = MATCHMAKING_TIERS.find((t) => t.key === match.tierKey);
    const profile = await Profile.findOne({
      serverId: match.serverId,
      userId: winnerId,
    });

    if (profile) {
      profile.winningsBalance = (profile.winningsBalance || 0) + tier.prize;
      await profile.save();
    }

    // Send completion message
    const guild = client.guilds.cache.get(match.serverId);
    const channel = await guild.channels.fetch(match.channelId);

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

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
    console.error("Error confirming match result:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

/**
 * Dispute match result
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
    report.reportedWinnerId = null;
    report.reportedBy = null;
    await report.save();

    // Send dispute message
    const guild = client.guilds.cache.get(match.serverId);
    const channel = await guild.channels.fetch(match.channelId);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Result Disputed")
      .setDescription(
        `<@${disputerId}> disputed the match result.\n\n` +
          `Please discuss with your opponent and report the correct result, or contact an admin if you cannot agree.`
      )
      .setColor(0xed4245)
      .setTimestamp();

    // Re-add the original report buttons
    const p1Name = await safeDisplayName(guild, match.player1Id);
    const p2Name = await safeDisplayName(guild, match.player2Id);

    const buttons = new ActionRowBuilder().addComponents(
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
      embeds: [embed],
      components: [buttons],
    });

    return {
      success: true,
      message: "✅ Result disputed. Please report the correct result.",
    };
  } catch (err) {
    console.error("Error disputing match result:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

module.exports = {
  joinMatchmaking,
  leaveMatchmaking,
  handleMapSelection,
  reportMatchResult,
  confirmMatchResult,
  disputeMatchResult,
};
