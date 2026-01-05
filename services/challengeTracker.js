const DailyChallenges = require("../models/DailyChallenges");

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Record a match for daily challenges
 * Call this after every match completion
 */
async function recordMatchForChallenges(serverId, userId, tierKey, isWinner) {
  try {
    const today = getTodayDate();

    // Find or create today's challenge progress
    let challenges = await DailyChallenges.findOne({ serverId, userId, date: today });

    if (!challenges) {
      challenges = await DailyChallenges.create({
        serverId,
        userId,
        date: today,
        matchesPlayed: 0,
        mm10PlusWins: 0,
        mm20PlusWins: 0,
        mm50Wins: 0,
      });
    }

    // Increment matches played
    challenges.matchesPlayed += 1;

    // If won, increment appropriate win counters
    if (isWinner) {
      if (tierKey === "MM10" || tierKey === "MM20" || tierKey === "MM50") {
        challenges.mm10PlusWins += 1;
      }
      if (tierKey === "MM20" || tierKey === "MM50") {
        challenges.mm20PlusWins += 1;
      }
      if (tierKey === "MM50") {
        challenges.mm50Wins += 1;
      }
    }

    await challenges.save();
  } catch (err) {
    console.error("Error recording match for challenges:", err);
  }
}

/**
 * Get user's daily challenge progress
 */
async function getDailyChallengeProgress(serverId, userId) {
  const today = getTodayDate();
  let challenges = await DailyChallenges.findOne({ serverId, userId, date: today });

  if (!challenges) {
    challenges = {
      matchesPlayed: 0,
      mm10PlusWins: 0,
      mm20PlusWins: 0,
      mm50Wins: 0,
      easyClaimed: false,
      mediumClaimed: false,
      hardClaimed: false,
      eliteClaimed: false,
    };
  }

  return challenges;
}

/**
 * Claim challenge rewards
 */
async function claimChallengeRewards(serverId, userId) {
  const today = getTodayDate();
  const challenges = await DailyChallenges.findOne({ serverId, userId, date: today });

  if (!challenges) {
    return { success: false, message: "❌ No challenge progress found for today." };
  }

  const Profile = require("../models/profileSchema");
  const profile = await Profile.findOne({ serverId, userId });

  if (!profile) {
    return { success: false, message: "❌ Profile not found." };
  }

  let totalRewards = 0;
  const rewardsList = [];

  // Check and claim Easy challenge (3 matches played)
  if (challenges.matchesPlayed >= 3 && !challenges.easyClaimed) {
    totalRewards += 3;
    rewardsList.push("🟢 Warm Up: +3 tickets");
    challenges.easyClaimed = true;
  }

  // Check and claim Medium challenge (2 MM10+ wins)
  if (challenges.mm10PlusWins >= 2 && !challenges.mediumClaimed) {
    totalRewards += 5;
    rewardsList.push("🟡 Step It Up: +5 tickets");
    challenges.mediumClaimed = true;
  }

  // Check and claim Hard challenge (3 MM20+ wins)
  if (challenges.mm20PlusWins >= 3 && !challenges.hardClaimed) {
    totalRewards += 10;
    rewardsList.push("🔴 High Roller: +10 tickets");
    challenges.hardClaimed = true;
  }

  // Check and claim Elite challenge (1 MM50 win)
  if (challenges.mm50Wins >= 1 && !challenges.eliteClaimed) {
    totalRewards += 15;
    rewardsList.push("💎 Elite Champion: +15 tickets");
    challenges.eliteClaimed = true;
  }

  if (totalRewards === 0) {
    return {
      success: false,
      message: "❌ No rewards available to claim. Complete challenges first!",
    };
  }

  // Award rewards
  profile.balance += totalRewards;
  await profile.save();
  await challenges.save();

  return {
    success: true,
    message:
      `🎁 **Rewards Claimed!**\n\n` +
      rewardsList.join("\n") +
      `\n\n**Total Bonus:** +${totalRewards} tickets 🎫\n` +
      `**New Balance:** ${profile.balance} tickets`,
  };
}

module.exports = {
  recordMatchForChallenges,
  getDailyChallengeProgress,
  claimChallengeRewards,
};
