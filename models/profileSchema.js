const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  serverId: { type: String, required: true },
  // Tickets the user holds (1 ticket costs $1 when purchased)
  balance: { type: Number, default: 20 },
  // Real-dollar winnings available to cash out, credited when a tournament ends
  winningsBalance: { type: Number, default: 0 },
});

const model = mongoose.model("Skirmishdb", profileSchema);

module.exports = model;
