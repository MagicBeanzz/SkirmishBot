const { Schema, model } = require("mongoose");

const PlayerStatsSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    serverId: { type: String, required: true, index: true },
    totalWins: { type: Number, default: 0 },
    totalMatches: { type: Number, default: 0 },
    lifetimeEarnings: { type: Number, default: 0 }, // Total dollars earned from wins
    tournamentsWon: { type: Number, default: 0 },
    tournamentsPlayed: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 }, // Current win streak
    bestStreak: { type: Number, default: 0 }, // Best win streak ever
  },
  { timestamps: true }
);

PlayerStatsSchema.index({ serverId: 1, totalWins: -1 });
PlayerStatsSchema.index({ serverId: 1, lifetimeEarnings: -1 });
PlayerStatsSchema.index({ userId: 1, serverId: 1 }, { unique: true });

module.exports = model("PlayerStats", PlayerStatsSchema);
