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
    // Weekly stats (reset every Monday)
    weeklyEarnings: { type: Number, default: 0 }, // Earnings this week
    weekStartDate: { type: Date, default: () => getWeekStart() }, // When current week started
  },
  { timestamps: true }
);

// Helper function to get the start of the current week (Monday 00:00)
function getWeekStart() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

PlayerStatsSchema.index({ serverId: 1, totalWins: -1 });
PlayerStatsSchema.index({ serverId: 1, lifetimeEarnings: -1 });
PlayerStatsSchema.index({ serverId: 1, weeklyEarnings: -1 });
PlayerStatsSchema.index({ userId: 1, serverId: 1 }, { unique: true });

module.exports = model("PlayerStats", PlayerStatsSchema);
