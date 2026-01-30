// Matchmaking tiers for 1v1 instant matches
// LEGAL COMPLIANCE: Winner receives 100% of combined entry fees
// House profit comes from ticket purchase service fees, NOT match outcomes
module.exports = [
  { key: "MM5", label: "5 Ticket", cost: 5, prize: 10 },   // $5 × 2 players = $10 winner takes all
  { key: "MM10", label: "10 Ticket", cost: 10, prize: 20 }, // $10 × 2 players = $20 winner takes all
  { key: "MM20", label: "20 Ticket", cost: 20, prize: 40 }, // $20 × 2 players = $40 winner takes all
  { key: "MM50", label: "50 Ticket", cost: 50, prize: 100 }, // $50 × 2 players = $100 winner takes all
];
