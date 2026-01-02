const { Schema, model } = require("mongoose");

const QueueStateSchema = new Schema(
  {
    serverId: { type: String, index: true, required: true },
    tierKey: { type: String, index: true, required: true },
    pendingWindowEndAt: { type: Date, default: null }, // when to decide 4 vs 8
    lastPanelMessageId: { type: String, default: null }, // pinned panel message
  },
  { timestamps: true }
);

QueueStateSchema.index({ serverId: 1, tierKey: 1 }, { unique: true });

module.exports = model("QueueState", QueueStateSchema);
