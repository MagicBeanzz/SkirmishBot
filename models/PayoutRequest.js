const { Schema, model } = require("mongoose");

const PayoutRequestSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true }, // PayPal, Venmo, etc.
    paymentDetails: { type: String, required: true }, // email, username, etc.
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },
    processedBy: { type: String, default: null }, // Admin who processed it
    processedAt: { type: Date, default: null },
    notes: { type: String, default: null }, // Admin notes
  },
  { timestamps: true }
);

PayoutRequestSchema.index({ userId: 1, serverId: 1, createdAt: -1 });
PayoutRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = model("PayoutRequest", PayoutRequestSchema);
