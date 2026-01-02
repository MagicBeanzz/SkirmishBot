const { Schema, model } = require("mongoose");

const TicketPurchaseSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true, index: true },
    bundleId: { type: String, required: true },
    tickets: { type: Number, required: true },
    amountPaid: { type: Number, required: true }, // In dollars
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntent: { type: String, default: null },
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TicketPurchaseSchema.index({ userId: 1, serverId: 1, createdAt: -1 });

module.exports = model("TicketPurchase", TicketPurchaseSchema);
