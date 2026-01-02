const Prize = require("../models/Prize");
const Redemption = require("../models/Redemption");
const Profile = require("../models/profileSchema");

/**
 * Get prizes with filters and pagination
 */
async function getPrizes({
  category = null,
  featured = null,
  active = true,
  page = 0,
  limit = 10,
  sortBy = "pointCost",
  sortOrder = "asc",
}) {
  const query = { active };

  if (category) query.category = category;
  if (featured !== null) query.featured = featured;

  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  const prizes = await Prize.find(query)
    .sort(sort)
    .skip(page * limit)
    .limit(limit);

  const total = await Prize.countDocuments(query);

  return {
    prizes,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit + prizes.length < total,
  };
}

/**
 * Search prizes by name or description
 */
async function searchPrizes(searchTerm, limit = 10) {
  const prizes = await Prize.find({
    active: true,
    $or: [
      { name: { $regex: searchTerm, $options: "i" } },
      { description: { $regex: searchTerm, $options: "i" } },
      { cardSet: { $regex: searchTerm, $options: "i" } },
    ],
  })
    .limit(limit)
    .sort({ featured: -1, pointCost: 1 });

  return prizes;
}

/**
 * Get a single prize by ID
 */
async function getPrizeById(prizeId) {
  return await Prize.findById(prizeId);
}

/**
 * Redeem a prize
 */
async function redeemPrize(userId, serverId, prizeId, shippingInfo) {
  // Get user profile
  const profile = await Profile.findOne({ userId, serverId });
  if (!profile) {
    return { success: false, msg: "❌ Profile not found. Use /queue join first to create a profile." };
  }

  // Get prize
  const prize = await Prize.findById(prizeId);
  if (!prize) {
    return { success: false, msg: "❌ Prize not found." };
  }

  if (!prize.active) {
    return { success: false, msg: "❌ This prize is no longer available." };
  }

  if (prize.stock < 1) {
    return { success: false, msg: "❌ This prize is out of stock." };
  }

  // Check if user has enough points
  if (profile.points < prize.pointCost) {
    return {
      success: false,
      msg: `❌ Not enough points! You have **${profile.points}** points but need **${prize.pointCost}** points.`,
    };
  }

  // Create redemption
  const redemption = await Redemption.create({
    userId,
    serverId,
    prizeId: prize._id,
    prizeName: prize.name,
    prizeImageUrl: prize.imageUrl,
    pointCost: prize.pointCost,
    shippingAddress: shippingInfo,
    status: "pending",
  });

  // Deduct points
  profile.points -= prize.pointCost;
  await profile.save();

  // Decrease stock
  prize.stock -= 1;
  await prize.save();

  return {
    success: true,
    msg: `✅ Successfully redeemed **${prize.name}** for **${prize.pointCost}** points!\n\n` +
      `Redemption ID: \`${redemption._id}\`\n` +
      `Status: **Pending Approval**\n\n` +
      `An admin will review and ship your prize soon. You'll be notified when it ships!`,
    redemption,
  };
}

/**
 * Get user's redemption history
 */
async function getUserRedemptions(userId, serverId, limit = 10) {
  const redemptions = await Redemption.find({ userId, serverId })
    .sort({ createdAt: -1 })
    .limit(limit);

  return redemptions;
}

/**
 * Get all pending redemptions (admin use)
 */
async function getPendingRedemptions(serverId) {
  return await Redemption.find({ serverId, status: "pending" })
    .sort({ createdAt: 1 });
}

/**
 * Update redemption status (admin use)
 */
async function updateRedemptionStatus(
  redemptionId,
  status,
  trackingNumber = null,
  adminNotes = "",
  adminUserId = null
) {
  const redemption = await Redemption.findById(redemptionId);
  if (!redemption) {
    return { success: false, msg: "❌ Redemption not found." };
  }

  redemption.status = status;
  if (trackingNumber) redemption.trackingNumber = trackingNumber;
  if (adminNotes) redemption.adminNotes = adminNotes;
  if (adminUserId) redemption.processedBy = adminUserId;

  if (status === "shipped" && !redemption.shippedAt) {
    redemption.shippedAt = new Date();
  }

  if (status === "delivered" && !redemption.deliveredAt) {
    redemption.deliveredAt = new Date();
  }

  // If cancelled, refund points
  if (status === "cancelled") {
    const profile = await Profile.findOne({
      userId: redemption.userId,
      serverId: redemption.serverId,
    });
    if (profile) {
      profile.points += redemption.pointCost;
      await profile.save();
    }

    // Restore stock
    const prize = await Prize.findById(redemption.prizeId);
    if (prize) {
      prize.stock += 1;
      await prize.save();
    }
  }

  await redemption.save();

  return {
    success: true,
    msg: `✅ Redemption status updated to **${status}**.`,
    redemption,
  };
}

/**
 * Award points to a user (used by tournament system)
 */
async function awardPoints(userId, serverId, points, reason = "Tournament win") {
  let profile = await Profile.findOne({ userId, serverId });

  if (!profile) {
    // Create profile if doesn't exist
    profile = await Profile.create({ userId, serverId, balance: 0, points: 0 });
  }

  profile.points += points;
  await profile.save();

  return {
    success: true,
    newBalance: profile.points,
    awarded: points,
    reason,
  };
}

/**
 * Get prize categories with counts
 */
async function getCategoryCounts() {
  const categories = await Prize.aggregate([
    { $match: { active: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return categories.map((c) => ({ category: c._id, count: c.count }));
}

module.exports = {
  getPrizes,
  searchPrizes,
  getPrizeById,
  redeemPrize,
  getUserRedemptions,
  getPendingRedemptions,
  updateRedemptionStatus,
  awardPoints,
  getCategoryCounts,
};
