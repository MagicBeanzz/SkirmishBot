// services/analyticsService.js

const Profile = require("../models/profileSchema");
const PlayerStats = require("../models/PlayerStats");
const TicketPurchase = require("../models/TicketPurchase");
const PayoutRequest = require("../models/PayoutRequest");
const MatchmakingMatch = require("../models/MatchmakingMatch");
const AuditLog = require("../models/AuditLog");
const { TICKET_BUNDLES } = require("../config/ticketBundles");

/**
 * Analytics Service
 * Aggregates all platform metrics for real-time dashboard
 */

/**
 * Get time boundaries for various periods
 */
function getTimeBoundaries() {
  const now = new Date();

  // Today (start of day)
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // This week (Monday)
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Last 24 hours
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Last 7 days
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Last 30 days
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return { now, todayStart, weekStart, monthStart, last24h, last7d, last30d };
}

/**
 * Get revenue metrics from ticket purchases
 */
async function getRevenueMetrics(serverId) {
  const { todayStart, weekStart, monthStart, last24h, last7d, last30d } =
    getTimeBoundaries();

  // All-time revenue
  const allTimePurchases = await TicketPurchase.aggregate([
    { $match: { serverId, refunded: { $ne: true } } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amountPaid" },
        totalTicketsSold: { $sum: "$tickets" },
        purchaseCount: { $sum: 1 },
      },
    },
  ]);

  // Today's revenue
  const todayPurchases = await TicketPurchase.aggregate([
    { $match: { serverId, refunded: { $ne: true }, createdAt: { $gte: todayStart } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$amountPaid" },
        tickets: { $sum: "$tickets" },
        count: { $sum: 1 },
      },
    },
  ]);

  // This week's revenue
  const weekPurchases = await TicketPurchase.aggregate([
    { $match: { serverId, refunded: { $ne: true }, createdAt: { $gte: weekStart } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$amountPaid" },
        tickets: { $sum: "$tickets" },
        count: { $sum: 1 },
      },
    },
  ]);

  // This month's revenue
  const monthPurchases = await TicketPurchase.aggregate([
    { $match: { serverId, refunded: { $ne: true }, createdAt: { $gte: monthStart } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$amountPaid" },
        tickets: { $sum: "$tickets" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Bundle breakdown (all time)
  const bundleBreakdown = await TicketPurchase.aggregate([
    { $match: { serverId, refunded: { $ne: true } } },
    {
      $group: {
        _id: "$bundleId",
        count: { $sum: 1 },
        revenue: { $sum: "$amountPaid" },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Calculate service fees (profit) from bundles
  let totalServiceFees = 0;
  for (const bundle of bundleBreakdown) {
    const bundleConfig = TICKET_BUNDLES.find((b) => b.id === bundle._id);
    if (bundleConfig) {
      totalServiceFees += bundleConfig.serviceFee * bundle.count;
    }
  }

  return {
    allTime: {
      revenue: allTimePurchases[0]?.totalRevenue || 0,
      ticketsSold: allTimePurchases[0]?.totalTicketsSold || 0,
      purchases: allTimePurchases[0]?.purchaseCount || 0,
      serviceFees: totalServiceFees,
    },
    today: {
      revenue: todayPurchases[0]?.revenue || 0,
      tickets: todayPurchases[0]?.tickets || 0,
      purchases: todayPurchases[0]?.count || 0,
    },
    thisWeek: {
      revenue: weekPurchases[0]?.revenue || 0,
      tickets: weekPurchases[0]?.tickets || 0,
      purchases: weekPurchases[0]?.count || 0,
    },
    thisMonth: {
      revenue: monthPurchases[0]?.revenue || 0,
      tickets: monthPurchases[0]?.tickets || 0,
      purchases: monthPurchases[0]?.count || 0,
    },
    bundleBreakdown,
  };
}

/**
 * Get user metrics
 */
async function getUserMetrics(serverId) {
  const { todayStart, weekStart, last7d } = getTimeBoundaries();

  // Total registered users
  const totalUsers = await Profile.countDocuments({ serverId });

  // Users with activity (have stats)
  const activeUsers = await PlayerStats.countDocuments({ serverId });

  // New users today
  const newUsersToday = await Profile.countDocuments({
    serverId,
    // Note: Profile doesn't have timestamps, so we'll use PlayerStats or TicketPurchase
  });

  // Users who purchased this week
  const purchasingUsers = await TicketPurchase.distinct("userId", {
    serverId,
    createdAt: { $gte: weekStart },
  });

  // Users who played this week
  const playingUsers = await MatchmakingMatch.aggregate([
    { $match: { serverId, createdAt: { $gte: weekStart } } },
    {
      $group: {
        _id: null,
        players: {
          $addToSet: { $concatArrays: [["$player1Id"], ["$player2Id"]] },
        },
      },
    },
  ]);

  // Total ticket balance in circulation
  const ticketCirculation = await Profile.aggregate([
    { $match: { serverId } },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: "$balance" },
        totalWinnings: { $sum: "$winningsBalance" },
      },
    },
  ]);

  return {
    totalUsers,
    activeUsers,
    purchasingUsersThisWeek: purchasingUsers.length,
    ticketsInCirculation: ticketCirculation[0]?.totalTickets || 0,
    pendingWinnings: ticketCirculation[0]?.totalWinnings || 0,
  };
}

/**
 * Get match/competition metrics
 */
async function getMatchMetrics(serverId) {
  const { todayStart, weekStart, monthStart } = getTimeBoundaries();

  // All-time matches
  const allTimeMatches = await MatchmakingMatch.countDocuments({ serverId });
  const completedMatches = await MatchmakingMatch.countDocuments({
    serverId,
    status: "completed",
  });

  // Today's matches
  const todayMatches = await MatchmakingMatch.countDocuments({
    serverId,
    createdAt: { $gte: todayStart },
  });
  const todayCompleted = await MatchmakingMatch.countDocuments({
    serverId,
    status: "completed",
    createdAt: { $gte: todayStart },
  });

  // This week's matches
  const weekMatches = await MatchmakingMatch.countDocuments({
    serverId,
    createdAt: { $gte: weekStart },
  });

  // Active matches right now
  const activeMatches = await MatchmakingMatch.countDocuments({
    serverId,
    status: { $in: ["pickban", "playing"] },
  });

  // Match tier breakdown
  const tierBreakdown = await MatchmakingMatch.aggregate([
    { $match: { serverId, status: "completed" } },
    {
      $group: {
        _id: "$tierKey",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Prize pool moved (from completed matches)
  const prizeStats = await PlayerStats.aggregate([
    { $match: { serverId } },
    {
      $group: {
        _id: null,
        totalPrizePaid: { $sum: "$lifetimeEarnings" },
        totalWins: { $sum: "$totalWins" },
      },
    },
  ]);

  return {
    allTime: {
      total: allTimeMatches,
      completed: completedMatches,
    },
    today: {
      total: todayMatches,
      completed: todayCompleted,
    },
    thisWeek: {
      total: weekMatches,
    },
    activeNow: activeMatches,
    tierBreakdown,
    totalPrizePaid: prizeStats[0]?.totalPrizePaid || 0,
    totalWins: prizeStats[0]?.totalWins || 0,
  };
}

/**
 * Get payout metrics
 */
async function getPayoutMetrics(serverId) {
  const { weekStart, monthStart } = getTimeBoundaries();

  // Pending payouts
  const pendingPayouts = await PayoutRequest.aggregate([
    { $match: { serverId, status: "pending" } },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Completed payouts (all time)
  const completedPayouts = await PayoutRequest.aggregate([
    { $match: { serverId, status: "completed" } },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // This month completed
  const monthPayouts = await PayoutRequest.aggregate([
    {
      $match: {
        serverId,
        status: "completed",
        processedAt: { $gte: monthStart },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Payout method breakdown
  const methodBreakdown = await PayoutRequest.aggregate([
    { $match: { serverId, status: "completed" } },
    {
      $group: {
        _id: "$method",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    pending: {
      amount: pendingPayouts[0]?.total || 0,
      count: pendingPayouts[0]?.count || 0,
    },
    completedAllTime: {
      amount: completedPayouts[0]?.total || 0,
      count: completedPayouts[0]?.count || 0,
    },
    completedThisMonth: {
      amount: monthPayouts[0]?.total || 0,
      count: monthPayouts[0]?.count || 0,
    },
    methodBreakdown,
  };
}

/**
 * Get financial health metrics
 */
async function getFinancialHealth(serverId) {
  const revenue = await getRevenueMetrics(serverId);
  const users = await getUserMetrics(serverId);
  const payouts = await getPayoutMetrics(serverId);

  // Gross profit = Service fees collected
  const grossProfit = revenue.allTime.serviceFees;

  // Estimate Stripe fees (2.9% + $0.30 per transaction)
  const stripeFees =
    revenue.allTime.revenue * 0.029 + revenue.allTime.purchases * 0.3;

  // Net profit estimate
  const netProfit = grossProfit - stripeFees;

  // Liability = pending winnings + pending payouts
  const liability = users.pendingWinnings + payouts.pending.amount;

  // Reserve ratio = (gross revenue - payouts) / liability
  const reserveRatio =
    liability > 0
      ? (revenue.allTime.revenue - payouts.completedAllTime.amount) / liability
      : 0;

  return {
    grossProfit,
    stripeFees,
    netProfit,
    liability,
    reserveRatio,
    // Useful ratios
    avgRevenuePerUser:
      users.totalUsers > 0 ? revenue.allTime.revenue / users.totalUsers : 0,
    avgTicketsPerPurchase:
      revenue.allTime.purchases > 0
        ? revenue.allTime.ticketsSold / revenue.allTime.purchases
        : 0,
    conversionRate:
      users.totalUsers > 0
        ? (revenue.allTime.purchases / users.totalUsers) * 100
        : 0,
  };
}

/**
 * Get all analytics data
 */
async function getAllAnalytics(serverId) {
  const [revenue, users, matches, payouts, financial] = await Promise.all([
    getRevenueMetrics(serverId),
    getUserMetrics(serverId),
    getMatchMetrics(serverId),
    getPayoutMetrics(serverId),
    getFinancialHealth(serverId),
  ]);

  return {
    revenue,
    users,
    matches,
    payouts,
    financial,
    generatedAt: new Date(),
  };
}

/**
 * Reset all analytics data (for wiping test data before going live)
 * WARNING: This permanently deletes all financial and match data!
 */
async function resetAllAnalyticsData(serverId) {
  const results = {
    ticketPurchases: 0,
    matchmakingMatches: 0,
    payoutRequests: 0,
    playerStats: 0,
    auditLogs: 0,
    profilesReset: 0,
  };

  try {
    // Delete all ticket purchases
    const ticketResult = await TicketPurchase.deleteMany({ serverId });
    results.ticketPurchases = ticketResult.deletedCount;

    // Delete all matchmaking matches
    const matchResult = await MatchmakingMatch.deleteMany({ serverId });
    results.matchmakingMatches = matchResult.deletedCount;

    // Delete all payout requests
    const payoutResult = await PayoutRequest.deleteMany({ serverId });
    results.payoutRequests = payoutResult.deletedCount;

    // Delete all player stats
    const statsResult = await PlayerStats.deleteMany({ serverId });
    results.playerStats = statsResult.deletedCount;

    // Delete all audit logs
    const auditResult = await AuditLog.deleteMany({ serverId });
    results.auditLogs = auditResult.deletedCount;

    // Reset all profile balances to defaults (keep profiles, just reset balances)
    const profileResult = await Profile.updateMany(
      { serverId },
      {
        $set: {
          balance: 10, // Default starting tickets
          winningsBalance: 0,
        },
      }
    );
    results.profilesReset = profileResult.modifiedCount;

    console.log(`[Analytics Reset] Server ${serverId}:`, results);
    return { success: true, results };
  } catch (err) {
    console.error("Failed to reset analytics data:", err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getRevenueMetrics,
  getUserMetrics,
  getMatchMetrics,
  getPayoutMetrics,
  getFinancialHealth,
  getAllAnalytics,
  resetAllAnalyticsData,
};
