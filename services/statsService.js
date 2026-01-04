const PlayerStats = require("../models/PlayerStats");

/**
 * Get the start of the current week (Monday 00:00)
 */
function getWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Check if weekly stats need to be reset
 */
function shouldResetWeeklyStats(weekStartDate) {
  const currentWeekStart = getWeekStart();
  return !weekStartDate || new Date(weekStartDate) < currentWeekStart;
}

/**
 * Record a match result
 */
async function recordMatchResult(serverId, winnerId, loserId) {
  // Update winner stats
  let winnerStats = await PlayerStats.findOne({ serverId, userId: winnerId });
  if (!winnerStats) {
    winnerStats = await PlayerStats.create({
      serverId,
      userId: winnerId,
      totalWins: 0,
      totalMatches: 0,
      lifetimeEarnings: 0,
      tournamentsWon: 0,
      tournamentsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  }

  winnerStats.totalWins += 1;
  winnerStats.totalMatches += 1;
  winnerStats.currentStreak += 1;
  if (winnerStats.currentStreak > winnerStats.bestStreak) {
    winnerStats.bestStreak = winnerStats.currentStreak;
  }
  await winnerStats.save();

  // Update loser stats
  let loserStats = await PlayerStats.findOne({ serverId, userId: loserId });
  if (!loserStats) {
    loserStats = await PlayerStats.create({
      serverId,
      userId: loserId,
      totalWins: 0,
      totalMatches: 0,
      lifetimeEarnings: 0,
      tournamentsWon: 0,
      tournamentsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  }

  loserStats.totalMatches += 1;
  loserStats.currentStreak = 0; // Break streak on loss
  await loserStats.save();
}

/**
 * Record a tournament win
 */
async function recordTournamentWin(serverId, winnerId, prizeAmount) {
  let stats = await PlayerStats.findOne({ serverId, userId: winnerId });
  if (!stats) {
    stats = await PlayerStats.create({
      serverId,
      userId: winnerId,
      totalWins: 0,
      totalMatches: 0,
      lifetimeEarnings: 0,
      tournamentsWon: 0,
      tournamentsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      weeklyEarnings: 0,
      weekStartDate: getWeekStart(),
    });
  }

  // Check if we need to reset weekly stats
  if (shouldResetWeeklyStats(stats.weekStartDate)) {
    stats.weeklyEarnings = 0;
    stats.weekStartDate = getWeekStart();
  }

  stats.tournamentsWon += 1;
  stats.lifetimeEarnings += prizeAmount;
  stats.weeklyEarnings += prizeAmount;
  await stats.save();
}

/**
 * Record tournament participation (call for all players at tournament start)
 */
async function recordTournamentParticipation(serverId, playerIds) {
  for (const userId of playerIds) {
    let stats = await PlayerStats.findOne({ serverId, userId });
    if (!stats) {
      stats = await PlayerStats.create({
        serverId,
        userId,
        totalWins: 0,
        totalMatches: 0,
        lifetimeEarnings: 0,
        tournamentsWon: 0,
        tournamentsPlayed: 0,
        currentStreak: 0,
        bestStreak: 0,
      });
    }

    stats.tournamentsPlayed += 1;
    await stats.save();
  }
}

/**
 * Record a matchmaking match win with prize
 */
async function recordMatchmakingWin(serverId, winnerId, prizeAmount) {
  let stats = await PlayerStats.findOne({ serverId, userId: winnerId });
  if (!stats) {
    stats = await PlayerStats.create({
      serverId,
      userId: winnerId,
      totalWins: 0,
      totalMatches: 0,
      lifetimeEarnings: 0,
      tournamentsWon: 0,
      tournamentsPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      weeklyEarnings: 0,
      weekStartDate: getWeekStart(),
    });
  }

  // Check if we need to reset weekly stats
  if (shouldResetWeeklyStats(stats.weekStartDate)) {
    stats.weeklyEarnings = 0;
    stats.weekStartDate = getWeekStart();
  }

  stats.lifetimeEarnings += prizeAmount;
  stats.weeklyEarnings += prizeAmount;
  await stats.save();
}

module.exports = {
  recordMatchResult,
  recordTournamentWin,
  recordTournamentParticipation,
  recordMatchmakingWin,
};
