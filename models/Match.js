const { Schema, model } = require("mongoose");
const { MATCH_STATES } = require("../config/constants");

const MatchSchema = new Schema(
  {
    serverId: { type: String, index: true, required: true },
    tournamentId: { type: String, index: true, required: true },
    round: { type: Number, required: true }, // 1,2,3...
    playerA: { type: String, required: true }, // In 2v2, this is team captain A
    playerB: { type: String, required: true }, // In 2v2, this is team captain B
    state: {
      type: String,
      enum: Object.values(MATCH_STATES),
      default: MATCH_STATES.PENDING,
    },
    winnerId: { type: String, default: null },
    channelId: { type: String, default: null }, // private match channel

    // Game mode
    gameMode: { type: String, enum: ["1v1", "2v2"], default: "1v1" },

    // 2v2 specific: full team rosters (for channel permissions)
    teamA: [{ type: String }], // [player1, player2]
    teamB: [{ type: String }], // [player1, player2]

    // 2v2 specific: team names for display
    teamAName: { type: String, default: null },
    teamBName: { type: String, default: null },
  },
  { timestamps: true }
);

MatchSchema.index({ tournamentId: 1, round: 1 });

module.exports = model("Match", MatchSchema);
