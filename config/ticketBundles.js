// config/ticketBundles.js

/**
 * Ticket Bundle Configuration
 *
 * Strategy (Updated for Legal Compliance):
 * - Base stake: $1.00 per ticket (goes to prize pool)
 * - Service fee: 35% (small bundles) → 20% (large bundles)
 * - Total price = Stake + Service Fee
 * - Service fee decreases with volume to reward larger purchases
 *
 * Legal Structure:
 * - Stake = Entry fee that goes into prize pool
 * - Service Fee = Platform fee for operating the skill competition
 * - Prize = Stake only (service fee not included in prizes)
 */

const TICKET_BUNDLES = [
  {
    id: "starter_5",
    tickets: 5,
    stake: 5.0, // $1.00/ticket stake
    serviceFeePercent: 35, // 35% service fee
    serviceFee: 1.75,
    price: 6.75, // Total: stake + service fee
    priceInCents: 675,
    label: "Starter Pack",
    description: "5 tickets - Perfect for one MM5 entry",
    emoji: "🎫",
    popular: false,
  },
  {
    id: "basic_10",
    tickets: 10,
    stake: 10.0, // $1.00/ticket stake
    serviceFeePercent: 30, // 30% service fee
    serviceFee: 3.0,
    price: 13.0, // Total: stake + service fee
    priceInCents: 1300,
    label: "Basic Pack",
    description: "10 tickets - One MM10 or two MM5 entries",
    emoji: "🎟️",
    popular: false,
  },
  {
    id: "pro_25",
    tickets: 25,
    stake: 25.0, // $1.00/ticket stake
    serviceFeePercent: 25, // 25% service fee
    serviceFee: 6.25,
    price: 31.25, // Total: stake + service fee
    priceInCents: 3125,
    label: "Pro Pack",
    description: "25 tickets - Multiple tournament entries",
    emoji: "🎖️",
    popular: true,
  },
  {
    id: "elite_50",
    tickets: 50,
    stake: 50.0, // $1.00/ticket stake
    serviceFeePercent: 20, // 20% service fee - BEST VALUE
    serviceFee: 10.0,
    price: 60.0, // Total: stake + service fee
    priceInCents: 6000,
    label: "Elite Pack",
    description: "50 tickets - Best value for serious players",
    emoji: "💎",
    popular: false,
  },
  {
    id: "champion_100",
    tickets: 100,
    stake: 100.0, // $1.00/ticket stake
    serviceFeePercent: 20, // 20% service fee - BEST VALUE
    serviceFee: 20.0,
    price: 120.0, // Total: stake + service fee
    priceInCents: 12000,
    label: "Champion Pack",
    description: "100 tickets - Best value for grinders",
    emoji: "👑",
    popular: false,
  },
];

/**
 * Calculate actual margin after Stripe fees
 */
function calculateMargin(priceInDollars) {
  const stripeFee = priceInDollars * 0.029 + 0.3;
  const netRevenue = priceInDollars - stripeFee;
  return netRevenue;
}

/**
 * Get bundle by ID
 */
function getBundleById(bundleId) {
  return TICKET_BUNDLES.find((b) => b.id === bundleId);
}

module.exports = {
  TICKET_BUNDLES,
  calculateMargin,
  getBundleById,
};
