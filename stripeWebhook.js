// stripeWebhook.js - Run this as a separate process for handling Stripe webhooks
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const {
  verifyWebhookSignature,
  handleSuccessfulPayment,
} = require("./services/stripeService");

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3000;

const PURCHASE_HISTORY_CHANNEL_ID = "1430026361577410630";

// Initialize Discord client for sending notifications
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.login(process.env.DISCORD_TOKEN);

// Wait for client to be ready
client.once("ready", () => {
  console.log(`✅ Discord client ready: ${client.user.tag}`);
});

// IMPORTANT: Use raw body for Stripe webhook signature verification
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    // Verify webhook signature
    const event = verifyWebhookSignature(req.body, signature);

    if (!event) {
      console.error("⚠️ Webhook signature verification failed");
      return res.status(400).send("Webhook signature verification failed");
    }

    console.log(`📨 Received Stripe event: ${event.type}`);

    // Handle the event
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;

          // Only process if payment was successful
          if (session.payment_status === "paid") {
            const result = await handleSuccessfulPayment(session);

            if (result) {
              console.log(
                `✅ Successfully processed payment for user ${result.userId}: ${result.tickets} tickets`
              );

              // Send purchase confirmation to history channel
              try {
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                const channel = await guild.channels.fetch(
                  PURCHASE_HISTORY_CHANNEL_ID
                );

                // Create fancy embed for purchase history
                const embed = new EmbedBuilder()
                  .setTitle("🎫 Ticket Purchase")
                  .setDescription(`<@${result.userId}> purchased tickets!`)
                  .setColor(0x57f287) // Green
                  .addFields(
                    {
                      name: "Bundle",
                      value: `**${result.bundleName}**`,
                      inline: true,
                    },
                    {
                      name: "Tickets",
                      value: `**${result.tickets}** 🎟️`,
                      inline: true,
                    },
                    {
                      name: "Amount Paid",
                      value: `**$${result.amountPaid.toFixed(2)}**`,
                      inline: true,
                    }
                  )
                  .setFooter({
                    text: "Win tournaments to earn prize points • Redeem prizes at /prizes",
                  })
                  .setTimestamp(new Date());

                await channel.send({
                  content: `✅ <@${result.userId}> purchase confirmed!`,
                  embeds: [embed],
                });

                console.log(
                  `📢 Posted purchase to history channel for user ${result.userId}`
                );
              } catch (discordErr) {
                console.error(
                  "Failed to post to purchase history channel:",
                  discordErr
                );
                // Don't fail the webhook if Discord notification fails
              }
            }
          }
          break;
        }

        case "payment_intent.succeeded": {
          console.log("💰 Payment succeeded:", event.data.object.id);
          break;
        }

        case "payment_intent.payment_failed": {
          console.log("❌ Payment failed:", event.data.object.id);
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Error processing webhook:", err);
      res.status(500).send("Webhook processing failed");
    }
  }
);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Success page (optional - users see this after payment)
app.get("/payment-success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Successful</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          h1 { font-size: 48px; margin-bottom: 20px; }
          p { font-size: 18px; line-height: 1.6; }
          .emoji { font-size: 64px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">✅🎉</div>
          <h1>Payment Successful!</h1>
          <p>Your tickets have been added to your account.</p>
          <p>Return to Discord to start playing tournaments!</p>
        </div>
      </body>
    </html>
  `);
});

// Cancelled page
app.get("/payment-cancelled", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Cancelled</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          h1 { font-size: 48px; margin-bottom: 20px; }
          p { font-size: 18px; line-height: 1.6; }
          .emoji { font-size: 64px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">❌</div>
          <h1>Payment Cancelled</h1>
          <p>Your payment was cancelled. No charges were made.</p>
          <p>Return to Discord to try again.</p>
        </div>
      </body>
    </html>
  `);
});

// Start server
mongoose
  .connect(process.env.MONGODB_SRV, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`🚀 Stripe webhook server listening on port ${PORT}`);
      console.log(
        `📍 Webhook endpoint: http://localhost:${PORT}/webhook/stripe`
      );
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
    process.exit(1);
  });
