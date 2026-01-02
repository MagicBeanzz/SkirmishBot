const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getBundleById } = require("../config/ticketBundles");

const PURCHASE_HISTORY_CHANNEL_ID = "1430026361577410630";

/**
 * Create a Stripe Checkout session for purchasing tickets
 */
async function createTicketCheckoutSession(userId, bundleId, serverId) {
  const bundle = getBundleById(bundleId);

  if (!bundle) {
    throw new Error("Invalid bundle ID");
  }

  // Create checkout session - redirect to purchase history channel
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${bundle.emoji} ${bundle.label}`,
            description: bundle.description,
            images: [], // Optional: Add your bot's logo URL here
          },
          unit_amount: bundle.priceInCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `https://discord.com/channels/${serverId}/${PURCHASE_HISTORY_CHANNEL_ID}`,
    cancel_url: `https://discord.com/channels/${serverId}/${PURCHASE_HISTORY_CHANNEL_ID}`,
    client_reference_id: userId, // Link payment to Discord user
    metadata: {
      userId: userId,
      serverId: serverId,
      bundleId: bundleId,
      tickets: bundle.tickets.toString(),
    },
  });

  return session;
}

/**
 * Verify a Stripe webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
    return event;
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return null;
  }
}

/**
 * Handle successful payment
 */
async function handleSuccessfulPayment(session) {
  const Profile = require("../models/profileSchema");
  const TicketPurchase = require("../models/TicketPurchase");

  const { userId, serverId, bundleId, tickets } = session.metadata;
  const bundle = getBundleById(bundleId);

  // Credit tickets to user's profile
  const profile = await Profile.findOne({ serverId, userId });

  if (!profile) {
    console.error(`Profile not found for user ${userId}`);
    return;
  }

  profile.balance = (profile.balance || 0) + parseInt(tickets);
  await profile.save();

  // Record purchase
  await TicketPurchase.create({
    userId,
    serverId,
    bundleId,
    tickets: parseInt(tickets),
    amountPaid: session.amount_total / 100, // Convert cents to dollars
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent,
  });

  console.log(
    `✅ Credited ${tickets} tickets to user ${userId} (${bundle.label})`
  );

  return {
    userId,
    tickets: parseInt(tickets),
    bundleName: bundle.label,
    amountPaid: session.amount_total / 100,
  };
}

module.exports = {
  createTicketCheckoutSession,
  verifyWebhookSignature,
  handleSuccessfulPayment,
};
