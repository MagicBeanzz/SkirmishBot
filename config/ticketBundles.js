// config/ticketBundles.js

/**
 * Ticket Bundle Configuration
 *
 * Strategy:
 * - Base price: $1.00 per ticket
 * - Larger bundles get discounts (encourage bigger purchases)
 * - Bundle sizes align with tournament entry costs (1, 5, 10, 20)
 * - Prices calculated to absorb Stripe fees (2.9% + $0.30)
 *
 * Margin calculation:
 * - After Stripe fees, we keep ~$0.97 per ticket on average
 * - Small bundles have slightly higher per-ticket cost
 * - Large bundles reward loyalty with better value
 */

const TICKET_BUNDLES = [
  {
    id: "starter_5",
    tickets: 5,
    price: 5.5, // $1.10/ticket - covers 1 T5 entry
    priceInCents: 550,
    label: "Starter Pack",
    description: "5 tickets - Perfect for one T5 tournament",
    emoji: "🎫",
    popular: false,
  },
  {
    id: "basic_10",
    tickets: 10,
    price: 10.5, // $1.05/ticket - covers 1 T10 entry
    priceInCents: 1050,
    label: "Basic Pack",
    description: "10 tickets - One T10 or two T5 entries",
    emoji: "🎟️",
    popular: false,
  },
  {
    id: "pro_25",
    tickets: 25,
    price: 25.5, // $1.02/ticket - covers 1 T20 + 1 T5
    priceInCents: 2550,
    label: "Pro Pack",
    description: "25 tickets - Multiple tournament entries",
    emoji: "🎖️",
    popular: true, // Highlight this one
  },
  {
    id: "elite_50",
    tickets: 50,
    price: 50.0, // $1.00/ticket - covers 2 T20 + 1 T10
    priceInCents: 5000,
    label: "Elite Pack",
    description: "50 tickets - Best value for serious players",
    emoji: "💎",
    popular: false,
  },
  {
    id: "champion_100",
    tickets: 100,
    price: 100.0, // $1.00/ticket - BEST VALUE
    priceInCents: 10000,
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
