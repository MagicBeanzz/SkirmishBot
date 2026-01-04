const { Schema, model } = require("mongoose");

const MatchmakingMatchSchema = new Schema(
  {
    serverId: { type: String, required: true, index: true },
    tierKey: { type: String, required: true }, // 'MM5' | 'MM10' | 'MM20'
    player1Id: { type: String, required: true },
    player2Id: { type: String, required: true },
    status: {
      type: String,
      enum: ["pickban", "playing", "completed", "cancelled"],
      default: "pickban",
    },
    // Map pick/ban state
    pickBanState: {
      bannedMaps: { type: [String], default: [] },
      selectedMap: { type: String, default: null },
      currentAction: { type: String, default: "p1_ban" }, // "p1_ban" | "p2_ban" | "p1_pick"
      messageId: { type: String, default: null }, // ID of pick/ban message to update
    },
    // Match results
    winnerId: { type: String },
    player1Score: { type: Number },
    player2Score: { type: Number },
    // Discord references
    channelId: { type: String },
    threadId: { type: String },
    // Timestamps
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

MatchmakingMatchSchema.index({ serverId: 1, status: 1 });

module.exports = model("MatchmakingMatch", MatchmakingMatchSchema);
