const QueueEntry2v2 = require("../models/QueueEntry2v2");
const Team = require("../models/Team");
const Profile = require("../models/profileSchema");
const TIERS = require("../config/tiers");

async function join2v2(serverId, userId, tierKey) {
  const tier = TIERS.find((t) => t.key === tierKey);
  if (!tier) return { ok: false, msg: "Unknown tier." };

  // Find user's team (or create solo team)
  let team = await Team.findOne({
    serverId,
    $or: [{ leaderId: userId }, { partnerId: userId }],
    status: { $in: ["forming", "ready"] },
  });

  if (!team) {
    // Create solo team automatically
    team = await Team.create({
      serverId,
      teamName: `Solo Player`,
      leaderId: userId,
      status: "forming", // Will be paired
    });
  }

  // Check if team leader has tickets (both players need tickets)
  const leaderProfile = await Profile.findOne({
    serverId,
    userId: team.leaderId,
  });
  const leaderBalance = leaderProfile?.balance ?? 0;

  if (leaderBalance < tier.cost) {
    return {
      ok: false,
      msg: `❌ Team leader needs ${tier.cost} tickets but has ${leaderBalance}.`,
    };
  }

  // If team has partner, check their tickets too
  if (team.partnerId) {
    const partnerProfile = await Profile.findOne({
      serverId,
      userId: team.partnerId,
    });
    const partnerBalance = partnerProfile?.balance ?? 0;

    if (partnerBalance < tier.cost) {
      return {
        ok: false,
        msg: `❌ Your partner needs ${tier.cost} tickets but has ${partnerBalance}.`,
      };
    }
  }

  // Add to 2v2 queue
  const existing = await QueueEntry2v2.findOne({ teamId: team.id });
  if (existing) {
    return { ok: true, msg: `Your team is already queued for ${tier.label}.` };
  }

  await QueueEntry2v2.create({
    serverId,
    tierKey,
    teamId: team.id,
  });

  team.queuedFor = tierKey;
  await team.save();

  return {
    ok: true,
    msg:
      `✅ Team queued for ${tier.label}!\n` +
      (team.partnerId
        ? `Both players will be charged ${tier.cost} tickets when tournament starts.`
        : `You'll be auto-paired with another solo player. Both pay ${tier.cost} tickets.`),
  };
}

async function leave2v2(serverId, userId) {
  const team = await Team.findOne({
    serverId,
    $or: [{ leaderId: userId }, { partnerId: userId }],
    status: { $in: ["forming", "ready"] },
  });

  if (!team) {
    return { ok: false, msg: "You're not in a team." };
  }

  const deleted = await QueueEntry2v2.deleteOne({ teamId: team.id });
  if (deleted.deletedCount > 0) {
    team.queuedFor = null;
    await team.save();
    return { ok: true, msg: "Team removed from queue." };
  }

  return { ok: false, msg: "Your team isn't in queue." };
}

module.exports = { join2v2, leave2v2 };
