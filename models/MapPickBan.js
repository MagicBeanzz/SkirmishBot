const { Schema, model } = require("mongoose");

const MapPickBanSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    playerA: { type: String, required: true },
    playerB: { type: String, required: true },
    bannedMaps: [{ type: String }], // Array of banned map names
    selectedMap: { type: String, default: null }, // Final map choice
    currentBanner: { type: String, default: null }, // Who's turn to ban
    banOrder: [{ type: String }], // [playerA, playerB] - order of bans
    messageId: { type: String, default: null }, // ID of the pick/ban message
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model("MapPickBan", MapPickBanSchema);
