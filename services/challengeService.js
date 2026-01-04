const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Challenge = require("../models/Challenge");
const Profile = require("../models/profileSchema");
const MATCHMAKING_TIERS = require("../config/matchmakingTiers");
const { createMatchFromChallenge } = require("./matchmakingService");

const MATCHMAKING_CHANNEL_ID = "1457148385533362428";

/**
 * Create a challenge from one player to another
 */
async function createChallenge(client, serverId, challengerId, opponentId, tierKey) {
  try {
    // Validation
    if (challengerId === opponentId) {
      return { success: false, message: "❌ You cannot challenge yourself!" };
    }

    const tier = MATCHMAKING_TIERS.find((t) => t.key === tierKey);
    if (!tier) {
      return { success: false, message: "❌ Invalid tier selected." };
    }

    // Check if challenger has a pending challenge already
    const existingFromChallenger = await Challenge.findOne({
      serverId,
      challengerId,
      status: "pending",
    });
    if (existingFromChallenger) {
      return {
        success: false,
        message: "❌ You already have a pending challenge. Wait for a response first.",
      };
    }

    // Check if opponent has a pending challenge from this person already
    const existingToOpponent = await Challenge.findOne({
      serverId,
      challengerId,
      opponentId,
      status: "pending",
    });
    if (existingToOpponent) {
      return {
        success: false,
        message: "❌ You already challenged this player. Wait for their response.",
      };
    }

    // Check both players have enough tickets
    const challengerProfile = await Profile.findOne({ serverId, userId: challengerId });
    const opponentProfile = await Profile.findOne({ serverId, userId: opponentId });

    if (!challengerProfile || challengerProfile.balance < tier.cost) {
      return {
        success: false,
        message: `❌ You need ${tier.cost} tickets to create this challenge.`,
      };
    }

    if (!opponentProfile || opponentProfile.balance < tier.cost) {
      return {
        success: false,
        message: `❌ Your opponent doesn't have enough tickets for this tier.`,
      };
    }

    // Check if either player is already in a match or queue
    const MatchmakingEntry = require("../models/MatchmakingEntry");
    const MatchmakingMatch = require("../models/MatchmakingMatch");

    const challengerInQueue = await MatchmakingEntry.findOne({
      serverId,
      userId: challengerId,
    });
    const opponentInQueue = await MatchmakingEntry.findOne({
      serverId,
      userId: opponentId,
    });

    if (challengerInQueue) {
      return {
        success: false,
        message: "❌ You are already in the matchmaking queue. Leave it first.",
      };
    }

    if (opponentInQueue) {
      return {
        success: false,
        message: "❌ Your opponent is already in a queue.",
      };
    }

    const challengerInMatch = await MatchmakingMatch.findOne({
      serverId,
      $or: [{ player1Id: challengerId }, { player2Id: challengerId }],
      status: { $in: ["pickban", "playing"] },
    });

    const opponentInMatch = await MatchmakingMatch.findOne({
      serverId,
      $or: [{ player1Id: opponentId }, { player2Id: opponentId }],
      status: { $in: ["pickban", "playing"] },
    });

    if (challengerInMatch) {
      return {
        success: false,
        message: "❌ You are already in an active match.",
      };
    }

    if (opponentInMatch) {
      return {
        success: false,
        message: "❌ Your opponent is already in an active match.",
      };
    }

    // Create the challenge
    const challenge = await Challenge.create({
      serverId,
      challengerId,
      opponentId,
      tierKey,
      status: "pending",
    });

    // Send notification message
    const guild = await client.guilds.fetch(serverId);
    const channel = await guild.channels.fetch(MATCHMAKING_CHANNEL_ID);

    const embed = new EmbedBuilder()
      .setTitle("⚔️ Challenge Received!")
      .setDescription(
        `<@${opponentId}>, you've been challenged by <@${challengerId}>!\n\n` +
          `**Tier:** ${tier.name}\n` +
          `**Entry:** ${tier.cost} tickets\n` +
          `**Prize:** $${tier.prize.toFixed(2)}\n\n` +
          `This challenge will expire in 5 minutes.`
      )
      .setColor(0xffa500)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`CHALLENGE_ACCEPT_${challenge._id}`)
        .setLabel("✅ Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`CHALLENGE_DECLINE_${challenge._id}`)
        .setLabel("❌ Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const message = await channel.send({
      content: `<@${opponentId}>`,
      embeds: [embed],
      components: [row],
    });

    // Store message ID for later deletion
    challenge.messageId = message.id;
    await challenge.save();

    return {
      success: true,
      message: `✅ Challenge sent to <@${opponentId}>! They have 5 minutes to respond.`,
    };
  } catch (err) {
    console.error("Error creating challenge:", err);
    return { success: false, message: "❌ An error occurred while creating the challenge." };
  }
}

/**
 * Accept a challenge
 */
async function acceptChallenge(client, challengeId, accepterId) {
  try {
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return { success: false, message: "❌ Challenge not found or expired." };
    }

    if (challenge.status !== "pending") {
      return { success: false, message: "❌ This challenge is no longer available." };
    }

    if (challenge.opponentId !== accepterId) {
      return { success: false, message: "❌ This challenge is not for you." };
    }

    // Mark challenge as accepted
    challenge.status = "accepted";
    await challenge.save();

    // Deduct tickets from both players
    const tier = MATCHMAKING_TIERS.find((t) => t.key === challenge.tierKey);
    const challengerProfile = await Profile.findOne({
      serverId: challenge.serverId,
      userId: challenge.challengerId,
    });
    const opponentProfile = await Profile.findOne({
      serverId: challenge.serverId,
      userId: challenge.opponentId,
    });

    // Double-check tickets again
    if (!challengerProfile || challengerProfile.balance < tier.cost) {
      return {
        success: false,
        message: "❌ Challenger no longer has enough tickets.",
      };
    }

    if (!opponentProfile || opponentProfile.balance < tier.cost) {
      return {
        success: false,
        message: "❌ You no longer have enough tickets.",
      };
    }

    challengerProfile.balance -= tier.cost;
    opponentProfile.balance -= tier.cost;
    await challengerProfile.save();
    await opponentProfile.save();

    // Create match using the matchmaking service
    const matchResult = await createMatchFromChallenge(
      client,
      challenge.serverId,
      challenge.challengerId,
      challenge.opponentId,
      challenge.tierKey
    );

    if (!matchResult.success) {
      // Refund tickets if match creation failed
      challengerProfile.balance += tier.cost;
      opponentProfile.balance += tier.cost;
      await challengerProfile.save();
      await opponentProfile.save();

      return { success: false, message: matchResult.message };
    }

    // Delete the challenge notification message
    try {
      const guild = await client.guilds.fetch(challenge.serverId);
      const channel = await guild.channels.fetch(MATCHMAKING_CHANNEL_ID);
      const message = await channel.messages.fetch(challenge.messageId);
      await message.delete();
    } catch (err) {
      console.error("Error deleting challenge message:", err);
    }

    return {
      success: true,
      message: `✅ Challenge accepted! Match starting now.`,
    };
  } catch (err) {
    console.error("Error accepting challenge:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

/**
 * Decline a challenge
 */
async function declineChallenge(client, challengeId, declinerId) {
  try {
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return { success: false, message: "❌ Challenge not found or expired." };
    }

    if (challenge.status !== "pending") {
      return { success: false, message: "❌ This challenge is no longer available." };
    }

    if (challenge.opponentId !== declinerId) {
      return { success: false, message: "❌ This challenge is not for you." };
    }

    // Mark challenge as declined
    challenge.status = "declined";
    await challenge.save();

    // Delete the challenge notification message
    try {
      const guild = await client.guilds.fetch(challenge.serverId);
      const channel = await guild.channels.fetch(MATCHMAKING_CHANNEL_ID);
      const message = await channel.messages.fetch(challenge.messageId);
      await message.delete();
    } catch (err) {
      console.error("Error deleting challenge message:", err);
    }

    // Notify challenger
    try {
      const guild = await client.guilds.fetch(challenge.serverId);
      const channel = await guild.channels.fetch(MATCHMAKING_CHANNEL_ID);
      const notifyMsg = await channel.send(
        `<@${challenge.challengerId}>, your challenge to <@${challenge.opponentId}> was declined.`
      );

      // Delete notification after 10 seconds
      setTimeout(async () => {
        try {
          await notifyMsg.delete();
        } catch (err) {
          console.error("Error deleting decline notification:", err);
        }
      }, 10000);
    } catch (err) {
      console.error("Error sending decline notification:", err);
    }

    return {
      success: true,
      message: "✅ Challenge declined.",
    };
  } catch (err) {
    console.error("Error declining challenge:", err);
    return { success: false, message: "❌ An error occurred." };
  }
}

module.exports = {
  createChallenge,
  acceptChallenge,
  declineChallenge,
};
