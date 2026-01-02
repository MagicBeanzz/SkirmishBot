const { Schema, model } = require("mongoose");
const { BRACKET_STATES } = require("../config/constants");

const TournamentSchema = new Schema(
  {
    serverId: { type: String, index: true, required: true },
    tierKey: { type: String, index: true, required: true },
    size: { type: Number, enum: [4, 8], required: true },
    playerIds: [{ type: String, required: true }], // seeding order
    state: {
      type: String,
      enum: Object.values(BRACKET_STATES),
      default: BRACKET_STATES.ACTIVE,
    },
    tournamentChannelId: { type: String, default: null },
    bracketMessageId: { type: String, default: null },

    // Current round tracking
    currentRound: { type: Number, default: 1 }, // 1-based
    roundCount: { type: Number, default: 2 }, // 4p=2 rounds, 8p=3 rounds
    winnerId: { type: String, default: null },

    // Game mode
    gameMode: { type: String, enum: ["1v1", "2v2"], default: "1v1" },

    // 2v2 specific: store team information
    teamsMetadata: [
      {
        teamId: String,
        teamName: String,
        players: [String], // [leaderId, partnerId]
      },
    ],
  },
  { timestamps: true }
);

module.exports = model("Tournament", TournamentSchema);
