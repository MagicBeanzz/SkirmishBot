const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  serverId: { type: String, required: true },
  // Tickets the user holds (purchased with real money, used to enter tournaments)
  balance: { type: Number, default: 20 },
  // Prize points earned from winning tournaments (used to redeem prizes from catalog)
  points: { type: Number, default: 0 },
});

const model = mongoose.model("Skirmishdb", profileSchema);

module.exports = model;
