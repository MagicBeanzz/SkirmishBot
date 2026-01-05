const mongoose = require("mongoose");

const dailyChallengesSchema = new mongoose.Schema({
  serverId: { type: String, required: true },
  userId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format

  // Progress counters
  matchesPlayed: { type: Number, default: 0 },
  mm10PlusWins: { type: Number, default: 0 },
  mm20PlusWins: { type: Number, default: 0 },
  mm50Wins: { type: Number, default: 0 },

  // Claimed status
  easyClaimed: { type: Boolean, default: false },
  mediumClaimed: { type: Boolean, default: false },
  hardClaimed: { type: Boolean, default: false },
  eliteClaimed: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

// Compound index for efficient lookups
dailyChallengesSchema.index({ serverId: 1, userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyChallenges", dailyChallengesSchema);
