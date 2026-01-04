const { Schema, model } = require("mongoose");

const MatchmakingEntrySchema = new Schema(
  {
    userId: { type: String, index: true, required: true },
    serverId: { type: String, index: true, required: true },
    tierKey: { type: String, index: true, required: true }, // 'MM5' | 'MM10' | 'MM20'
    joinedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

MatchmakingEntrySchema.index({ serverId: 1, tierKey: 1, joinedAt: 1 });

module.exports = model("MatchmakingEntry", MatchmakingEntrySchema);
