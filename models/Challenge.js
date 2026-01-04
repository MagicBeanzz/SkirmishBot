const mongoose = require("mongoose");

const challengeSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  challengerId: { type: String, required: true },
  opponentId: { type: String, required: true },
  tierKey: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "accepted", "declined", "expired"],
    default: "pending",
  },
  messageId: { type: String }, // ID of the notification message
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => Date.now() + 5 * 60 * 1000 }, // 5 minutes
});

// Index for quick lookups
challengeSchema.index({ serverId: 1, opponentId: 1, status: 1 });
challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired

module.exports = mongoose.model("Challenge", challengeSchema);
