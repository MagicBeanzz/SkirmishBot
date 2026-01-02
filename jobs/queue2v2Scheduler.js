const { refresh2v2Panel } = require("../Components/queue2v2Panel");
const QueueEntry2v2 = require("../models/QueueEntry2v2");
const QueueState = require("../models/QueueState");
const Team = require("../models/Team");
const {
  formBracket2v2,
  createTournament2v2,
} = require("../services/tournament2v2Service");
const TIERS = require("../config/tiers");

const WINDOW_MS = 30 * 1000; // 30 seconds
const MIN_TEAMS = 2; // 4 players minimum
const UPGRADE_TEAMS = 4; // 8 players for upgrade

let interval = null;

/**
 * Check if we should open a window for a tier
 */
async function checkAndOpenWindow(serverId, tierKey) {
  const queuedEntries = await QueueEntry2v2.find({ serverId, tierKey });

  // Count how many actual teams we have (solos count as half)
  const teams = await Promise.all(
    queuedEntries.map((e) => Team.findById(e.teamId))
  );

  const validTeams = teams.filter((t) => t);
  const duos = validTeams.filter((t) => t.partnerId).length;
  const solos = validTeams.filter((t) => !t.partnerId).length;

  // Calculate effective team count (2 solos = 1 team)
  const effectiveTeams = duos + Math.floor(solos / 2);

  if (effectiveTeams < MIN_TEAMS) return; // Not enough

  // Check if window is already open
  const state = await QueueState.findOne({ serverId, tierKey });
  if (!state) {
    await QueueState.create({
      serverId,
      tierKey,
      pendingWindowEndAt: null,
    });
    return;
  }

  if (state.pendingWindowEndAt) return; // Window already open

  // Open window
  state.pendingWindowEndAt = new Date(Date.now() + WINDOW_MS);
  await state.save();

  console.log(
    `🕒 Opened 30s window for ${tierKey} 2v2 (${effectiveTeams} teams ready)`
  );
}

/**
 * Check if windows have expired and form brackets
 */
async function checkAndFormBrackets(client, serverId) {
  const now = new Date();
  const readyStates = await QueueState.find({
    serverId,
    pendingWindowEndAt: { $ne: null, $lte: now },
  });

  for (const state of readyStates) {
    console.log(`⏰ Window expired for ${state.tierKey} 2v2`);

    // Try to form bracket
    try {
      // Determine target size
      const queuedEntries = await QueueEntry2v2.find({
        serverId,
        tierKey: state.tierKey,
      });

      const teams = await Promise.all(
        queuedEntries.map((e) => Team.findById(e.teamId))
      );

      const validTeams = teams.filter((t) => t);
      const duos = validTeams.filter((t) => t.partnerId).length;
      const solos = validTeams.filter((t) => !t.partnerId).length;
      const effectiveTeams = duos + Math.floor(solos / 2);

      // Determine bracket size
      let targetSize = null;
      if (effectiveTeams >= UPGRADE_TEAMS) {
        targetSize = UPGRADE_TEAMS; // 8 players (4 teams)
      } else if (effectiveTeams >= MIN_TEAMS) {
        targetSize = MIN_TEAMS; // 4 players (2 teams)
      }

      // Close window
      state.pendingWindowEndAt = null;
      await state.save();

      if (!targetSize) {
        console.log(`❌ Not enough teams for ${state.tierKey} 2v2`);
        continue;
      }

      // Form bracket (returns { tierKey, size, userIds, teams })
      const result = await formBracket2v2(serverId, state.tierKey, targetSize);

      if (!result) {
        console.log(`❌ Failed to form bracket for ${state.tierKey} 2v2`);
        continue;
      }

      // Create tournament with proper parameters
      await createTournament2v2(
        client,
        serverId,
        result.tierKey,
        result.size,
        result.userIds,
        result.teams
      );

      console.log(
        `✅ Started ${state.tierKey} 2v2 tournament with ${result.teams.length} teams (${result.size} players)`
      );
    } catch (err) {
      console.error(`Error forming ${state.tierKey} 2v2 bracket:`, err);

      // Close window even on error
      state.pendingWindowEndAt = null;
      await state.save();
    }
  }

  // Refresh panel if any brackets were formed
  if (readyStates.length > 0) {
    try {
      await refresh2v2Panel(client);
    } catch (err) {
      console.error("Failed to refresh 2v2 panel:", err);
    }
  }
}

/**
 * Main scheduler loop
 */
function start(client) {
  if (interval) return;

  interval = setInterval(async () => {
    try {
      const serverId = process.env.GUILD_ID;

      // Check all tiers for window opening
      for (const tier of TIERS) {
        await checkAndOpenWindow(serverId, tier.key);
      }

      // Check for expired windows
      await checkAndFormBrackets(client, serverId);
    } catch (err) {
      console.error("2v2 queue scheduler error:", err);
    }
  }, 5_000); // Check every 5 seconds

  console.log("✅ 2v2 queue scheduler started");
}

function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    console.log("ℹ️ 2v2 queue scheduler stopped");
  }
}

module.exports = { start, stop };
