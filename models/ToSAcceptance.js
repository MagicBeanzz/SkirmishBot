const { Schema, model } = require("mongoose");

/**
 * ToS Acceptance Schema
 * Logs when users accept Terms of Service for legal compliance
 */
const ToSAcceptanceSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true },
    acceptedAt: { type: Date, required: true, default: Date.now },
    ipAddress: { type: String, default: null }, // Discord doesn't provide this
    version: { type: String, required: true, default: "1.0" }, // ToS version
    discordUsername: { type: String, default: null }, // Store username for records
  },
  { timestamps: true }
);

// Index for quick lookups
ToSAcceptanceSchema.index({ userId: 1, serverId: 1 });

module.exports = model("ToSAcceptance", ToSAcceptanceSchema);
