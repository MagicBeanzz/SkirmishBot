const { Schema, model } = require("mongoose");

const MatchReportSchema = new Schema(
  {
    matchId: { type: String, required: true, unique: true, index: true },
    reportedWinnerId: { type: String, default: null }, // Who was reported as winner
    reportedBy: { type: String, default: null }, // Who submitted the report
    confirmed: { type: Boolean, default: false }, // Whether opponent confirmed
    disputed: { type: Boolean, default: false }, // Whether opponent disputed
    reportMessageId: { type: String, default: null }, // Message ID of report interface
  },
  { timestamps: true }
);

module.exports = model("MatchReport", MatchReportSchema);
