const { Schema, model } = require("mongoose");

const TeamSchema = new Schema(
  {
    serverId: { type: String, required: true, index: true },
    teamName: { type: String, default: null },
    leaderId: { type: String, required: true },
    partnerId: { type: String, default: null }, // null if solo queue
    status: {
      type: String,
      enum: ["forming", "ready", "disbanded"],
      default: "forming",
    },
    inviteMessageId: { type: String, default: null },
    queuedFor: { type: String, default: null }, // tierKey if queued
  },
  { timestamps: true }
);

TeamSchema.index({ serverId: 1, leaderId: 1 });
TeamSchema.index({ serverId: 1, partnerId: 1 });
TeamSchema.index({ serverId: 1, queuedFor: 1, status: 1 });

module.exports = model("Team", TeamSchema);
