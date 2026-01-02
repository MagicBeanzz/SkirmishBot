module.exports = [
  { key: "T1", label: "Tier 1", cost: 1 },
  { key: "T5", label: "Tier 5", cost: 5 },
  { key: "T10", label: "Tier 10", cost: 10 },
  { key: "T20", label: "Tier 20", cost: 20 },
];

// Queue policy (used in services)
// • Start window opens when >=4 join a tier.
// • After 2 minutes, if >=8 present, start 8; else start 4.
module.exports.MIN_START = 4;
module.exports.UPGRADE_SIZE = 8;
module.exports.WINDOW_MS = 2 * 60 * 1000; // 2 minutes
