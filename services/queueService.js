const QueueEntry = require("../models/QueueEntry");
const QueueState = require("../models/QueueState");
const Profile = require("../models/profileSchema");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const { BRACKET_STATES } = require("../config/constants");
const TIERS = require("../config/tiers");
const { MIN_START, UPGRADE_SIZE, WINDOW_MS } = require("../config/tiers");

const TICKET_CHANNEL_ID =
  process.env.TICKET_CHANNEL_ID || "1427041016808210442";

/** Parse JOIN_T* button custom IDs into tier keys */
function tierFromCustomId(customId) {
  const m = customId.match(/^JOIN_(T1|T5|T10|T20)$/);
  if (!m) return null;
  return m[1];
}

/**
 * Is the user still ALIVE in any ACTIVE tournament on this server?
 * "Alive" means they have NOT lost a match yet in that tournament.
 *
 * Logic:
 *  1) Find ACTIVE tournaments where playerIds contains the user.
 *  2) If in none → not alive (free to queue).
 *  3) Check if there's any match in those tournaments where this user played
 *     AND the winnerId is set to the OTHER player (i.e., user lost).
 *     - If such a loss exists → user is eliminated → NOT alive → free to queue.
 *     - If no loss found → user is still alive (maybe between rounds) → block.
 */
async function isUserStillAliveInActiveTournament(serverId, userId) {
  const activeTourneys = await Tournament.find({
    serverId,
    state: BRACKET_STATES.ACTIVE,
    playerIds: userId,
  })
    .select({ _id: 1 })
    .lean();

  if (!activeTourneys.length) return false;

  const tIds = activeTourneys.map((t) => t._id);

  // "Lost" means: a match the user played where winnerId is set and != userId
  const hasLoss = await Match.exists({
    tournamentId: { $in: tIds },
    $or: [{ playerA: userId }, { playerB: userId }],
    winnerId: { $nin: [null, userId] }, // defined and not the user
  });

  // If they have any loss → eliminated → not alive.
  // If no loss → still alive (maybe waiting for next round) → block.
  return !hasLoss;
}

/**
 * Join a tier queue.
 * - BLOCK if the user is still alive in any ACTIVE tournament (even between rounds).
 * - CHECK if user has enough tickets for the tier cost.
 * - Ensures a Profile (no ticket charge here).
 * - If already queued, moving to another tier re-queues (no charge here either).
 */
async function join(serverId, userId, tierKey) {
  const tier = TIERS.find((t) => t.key === tierKey);
  if (!tier) return { ok: false, msg: "Unknown tier." };

  // Block if the user is still alive in an active tournament (includes between matches)
  if (await isUserStillAliveInActiveTournament(serverId, userId)) {
    return {
      ok: false,
      msg:
        "You're still participating in an active tournament (possibly between matches). " +
        "Please finish that tournament before joining a new queue.",
    };
  }

  // Block if the user is in an active matchmaking match
  const MatchmakingMatch = require("../models/MatchmakingMatch");
  const activeMatch = await MatchmakingMatch.findOne({
    serverId,
    $or: [{ player1Id: userId }, { player2Id: userId }],
    status: { $in: ["pickban", "playing"] },
  });
  if (activeMatch) {
    return {
      ok: false,
      msg: "You're currently in an active matchmaking match! Finish your current match before joining a new queue.",
    };
  }

  // Ensure profile exists (do not charge here)
  let profile = await Profile.findOne({ serverId, userId });
  if (!profile) {
    profile = await Profile.create({
      serverId,
      userId,
      balance: 10,
      winningsBalance: 0,
    });
  }

  // CHECK: Does user have enough tickets?
  const currentBalance = profile.balance ?? 0;
  if (currentBalance < tier.cost) {
    return {
      ok: false,
      msg:
        `❌ **Insufficient Tickets**\n\n` +
        `You need **${tier.cost} tickets** to join ${tier.label}, but you only have **${currentBalance} tickets**.\n\n` +
        `Purchase more tickets in <#${TICKET_CHANNEL_ID}> to join this tier.\n\n` +
        `💡 **Tip:** Tickets are only charged when a tournament actually starts!`,
    };
  }

  // If already queued, switching tiers re-queues (no refund/charge needed)
  const already = await QueueEntry.findOne({ serverId, userId });
  if (already) {
    if (already.tierKey === tierKey) {
      return { ok: true, msg: `You're already queued for ${tier.label}.` };
    }
    await QueueEntry.deleteOne({ _id: already._id });
  }

  await QueueEntry.create({ serverId, userId, tierKey });

  // If we just reached MIN_START on this tier and no window is open, open a window
  const count = await QueueEntry.countDocuments({ serverId, tierKey });
  const state = await QueueState.findOne({ serverId, tierKey });
  if (count >= MIN_START && state && !state.pendingWindowEndAt) {
    state.pendingWindowEndAt = new Date(Date.now() + WINDOW_MS);
    await state.save();
  }

  return {
    ok: true,
    msg: `✅ Joined ${tier.label}! Tickets are only charged if a tournament actually starts.`,
  };
}

/** Leave any queue the user is in */
async function leave(serverId, userId) {
  const res = await QueueEntry.deleteOne({ serverId, userId });
  return res.deletedCount > 0
    ? { ok: true, msg: "Left queue." }
    : { ok: false, msg: "You're not in any queue." };
}

/**
 * Charged start helper:
 * When a start window expires, form a bracket by:
 *  - Selecting earliest entries for the tier (target 8 or 4)
 *  - Skipping users who are still alive in another ACTIVE tournament
 *  - Filtering to users with enough tickets at that moment
 *  - Charging each selected user's tickets (tier.cost)
 *  - Deleting ONLY those consumed entries
 *  - Returning { tierKey, size, userIds } for tournament creation
 *
 * If fewer than MIN_START eligible after filtering, no one is charged or deleted.
 */
async function _collectAndChargeForBracket(serverId, tierKey) {
  const tier = TIERS.find((t) => t.key === tierKey);
  if (!tier) return null;

  const totalCount = await QueueEntry.countDocuments({ serverId, tierKey });
  if (totalCount < MIN_START) return null;

  const targetSize = totalCount >= UPGRADE_SIZE ? UPGRADE_SIZE : MIN_START;

  // Fetch candidates in FIFO order (grab a little extra to handle filters)
  const candidates = await QueueEntry.find({ serverId, tierKey })
    .sort({ joinedAt: 1 })
    .limit(Math.max(targetSize * 2, targetSize + 4));

  const eligible = [];
  for (const entry of candidates) {
    if (eligible.length >= targetSize) break;

    // Skip if user is still alive in any active tournament (includes between-rounds)
    if (await isUserStillAliveInActiveTournament(serverId, entry.userId))
      continue;

    // Skip if cannot pay now
    const profile = await Profile.findOne({
      serverId,
      userId: entry.userId,
    });

    if ((profile?.balance ?? 0) >= tier.cost) {
      eligible.push({ entry, profile });
    }
  }

  // Ensure even count (pairs) and minimum size
  while (eligible.length > targetSize) eligible.pop();
  if (eligible.length % 2 === 1) eligible.pop();

  if (eligible.length < MIN_START) {
    // Not enough eligible – do not charge or delete anyone
    return null;
  }

  // Charge tickets for selected players and delete their queue entries
  const chargedUserIds = [];
  for (const { entry, profile } of eligible) {
    profile.balance = Math.max(0, (profile.balance ?? 0) - tier.cost);
    await profile.save();
    chargedUserIds.push(entry.userId);
  }

  await QueueEntry.deleteMany({
    _id: { $in: eligible.map((e) => e.entry._id) },
  });

  return {
    tierKey,
    size: eligible.length,
    userIds: chargedUserIds,
  };
}

/**
 * Called by scheduler when windows expire.
 * Returns an array of operations (each operation already charged and dequeued).
 */
async function checkAndFormBracket(serverId) {
  const now = new Date();
  const ready = await QueueState.find({
    serverId,
    pendingWindowEndAt: { $ne: null },
  });

  const results = [];
  for (const state of ready) {
    if (now < state.pendingWindowEndAt) continue;

    // Try to form a charged bracket for this tier
    const op = await _collectAndChargeForBracket(serverId, state.tierKey);

    // Close the window either way (success or not enough eligible)
    state.pendingWindowEndAt = null;
    await state.save();

    if (op) results.push(op);
  }

  return results; // array of { tierKey, size, userIds }
}

module.exports = { join, leave, tierFromCustomId, checkAndFormBracket };
