const { Schema, model } = require("mongoose");

/**
 * Audit Log Model
 *
 * Comprehensive audit trail for all financial transactions and compliance events.
 *
 * Required for legal compliance:
 * - Track all stakes collected
 * - Track all service fees retained
 * - Track all prize payouts
 * - Track geofence checks
 * - Track ToS acceptances
 * - Maintain immutable records for regulatory review
 */

const AuditLogSchema = new Schema(
  {
    // User identification
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true, index: true },

    // Action type (for filtering and reporting)
    action: {
      type: String,
      required: true,
      enum: [
        // Financial transactions
        "ticket_purchase",
        "ticket_purchase_failed",
        "winnings_conversion",
        "payout_request",
        "payout_completed",
        "payout_rejected",

        // Match/Contest events
        "match_entry",
        "match_completed",
        "match_prize_awarded",
        "tournament_entry",
        "tournament_prize_awarded",

        // Compliance events
        "geofence_check_ticket_purchase",
        "geofence_check_payout",
        "geofence_block",
        "tos_accepted",
        "contest_rules_accepted",

        // Admin actions
        "admin_balance_adjustment",
        "admin_payout_approval",
        "admin_dispute_resolution",
      ],
      index: true,
    },

    // Transaction amounts (in USD)
    amounts: {
      stake: { type: Number, default: 0 }, // Entry fee that goes to prize pool
      serviceFee: { type: Number, default: 0 }, // Platform fee retained
      prize: { type: Number, default: 0 }, // Prize awarded
      total: { type: Number, default: 0 }, // Total transaction amount
    },

    // Detailed information (flexible object for different event types)
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Additional metadata
    metadata: {
      ipAddress: { type: String },
      userAgent: { type: String },
      stripePaymentId: { type: String },
      stripeCustomerId: { type: String },
      matchId: { type: String },
      tournamentId: { type: String },
    },

    // Immutability flag (once set, cannot be modified)
    immutable: { type: Boolean, default: true },

    // Timestamp (auto-managed)
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

// Indexes for efficient querying
AuditLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
AuditLogSchema.index({ serverId: 1, action: 1, timestamp: -1 });
AuditLogSchema.index({ "amounts.stake": 1 });
AuditLogSchema.index({ "amounts.prize": 1 });

// Prevent modification of immutable records
AuditLogSchema.pre("save", function (next) {
  if (!this.isNew && this.immutable) {
    return next(new Error("Cannot modify immutable audit log entry"));
  }
  next();
});

// Static method: Log ticket purchase
AuditLogSchema.statics.logTicketPurchase = async function (
  userId,
  serverId,
  bundleData,
  stripeData
) {
  return await this.create({
    userId,
    serverId,
    action: "ticket_purchase",
    amounts: {
      stake: bundleData.stake,
      serviceFee: bundleData.serviceFee,
      total: bundleData.price,
    },
    details: {
      bundleId: bundleData.id,
      tickets: bundleData.tickets,
      serviceFeePercent: bundleData.serviceFeePercent,
    },
    metadata: {
      stripePaymentId: stripeData.paymentIntentId,
      stripeCustomerId: stripeData.customerId,
    },
  });
};

// Static method: Log match prize award
AuditLogSchema.statics.logMatchPrize = async function (
  userId,
  serverId,
  matchId,
  tierData
) {
  return await this.create({
    userId,
    serverId,
    action: "match_prize_awarded",
    amounts: {
      stake: tierData.cost * 2, // Both players' stakes
      prize: tierData.prize,
      serviceFee: tierData.cost * 2 - tierData.prize, // House edge
    },
    details: {
      tierKey: tierData.key,
      tierLabel: tierData.label,
    },
    metadata: {
      matchId,
    },
  });
};

// Static method: Log payout request
AuditLogSchema.statics.logPayoutRequest = async function (
  userId,
  serverId,
  amount,
  method,
  details
) {
  return await this.create({
    userId,
    serverId,
    action: "payout_request",
    amounts: {
      total: amount,
    },
    details: {
      paymentMethod: method,
      paymentDetails: details,
    },
  });
};

// Static method: Log geofence check
AuditLogSchema.statics.logGeofence = async function (
  userId,
  serverId,
  checkResult,
  action
) {
  return await this.create({
    userId,
    serverId,
    action: checkResult.allowed ? `geofence_check_${action}` : "geofence_block",
    details: {
      state: checkResult.state,
      stateName: checkResult.stateName,
      reason: checkResult.reason,
      actionAttempted: action,
    },
    metadata: {
      ipAddress: checkResult.ipAddress,
    },
  });
};

// Static method: Generate financial report (for compliance)
AuditLogSchema.statics.generateFinancialReport = async function (
  startDate,
  endDate
) {
  const pipeline = [
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate },
        action: {
          $in: [
            "ticket_purchase",
            "match_prize_awarded",
            "payout_completed",
          ],
        },
      },
    },
    {
      $group: {
        _id: "$action",
        totalStakes: { $sum: "$amounts.stake" },
        totalServiceFees: { $sum: "$amounts.serviceFee" },
        totalPrizes: { $sum: "$amounts.prize" },
        count: { $sum: 1 },
      },
    },
  ];

  return await this.aggregate(pipeline);
};

module.exports = model("AuditLog", AuditLogSchema);
