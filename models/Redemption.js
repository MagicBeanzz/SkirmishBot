const { Schema, model } = require("mongoose");

/**
 * Redemption Schema
 * Tracks prize redemptions and shipping status
 */
const RedemptionSchema = new Schema(
  {
    // User info
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true },

    // Prize info (denormalized for history)
    prizeId: { type: Schema.Types.ObjectId, ref: "Prize", required: true },
    prizeName: { type: String, required: true },
    prizeImageUrl: { type: String, required: true },
    pointCost: { type: Number, required: true },

    // Status tracking
    status: {
      type: String,
      enum: ["pending", "approved", "shipped", "delivered", "cancelled"],
      default: "pending",
    },

    // Shipping info (collected via modal)
    shippingAddress: {
      fullName: { type: String, default: null },
      addressLine1: { type: String, default: null },
      addressLine2: { type: String, default: null },
      city: { type: String, default: null },
      state: { type: String, default: null },
      zipCode: { type: String, default: null },
      country: { type: String, default: "USA" },
      phone: { type: String, default: null },
    },

    // Fulfillment
    trackingNumber: { type: String, default: null },
    shippedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },

    // Admin notes
    adminNotes: { type: String, default: "" },
    processedBy: { type: String, default: null }, // Admin user ID who processed it
  },
  { timestamps: true }
);

// Indexes
RedemptionSchema.index({ userId: 1, createdAt: -1 });
RedemptionSchema.index({ status: 1, createdAt: -1 });

module.exports = model("Redemption", RedemptionSchema);
