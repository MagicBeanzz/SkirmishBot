const { Schema, model } = require("mongoose");

const QueueEntrySchema = new Schema(
  {
    userId: { type: String, index: true, required: true },
    serverId: { type: String, index: true, required: true },
    tierKey: { type: String, index: true, required: true }, // 'T1' | 'T5' | 'T10' | 'T20'
    joinedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

QueueEntrySchema.index({ serverId: 1, tierKey: 1, joinedAt: 1 });

module.exports = model("QueueEntry", QueueEntrySchema);
