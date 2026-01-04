const { ensurePanel, refreshPanel } = require("../Components/queuePanel");
const {
  ensure2v2Panel,
  refresh2v2Panel,
} = require("../Components/queue2v2Panel");
const { ensurePayoutPanel } = require("../Components/payoutPanel");
const {
  ensureTicketPurchasePanel,
} = require("../components/ticketPurchasePanel");
const { ensureLeaderboardPanel } = require("../components/leaderboardPanel");
const { upsertCatalogPanel } = require("../components/catalogPanel");
const { upsertToSPanel } = require("../components/tosPanel");
const { ensureMatchmakingPanel } = require("../components/matchmakingPanel");
const QueueEntry = require("../models/QueueEntry");
const QueueState = require("../models/QueueState");
const scheduler = require("../jobs/queueScheduler");
const scheduler2v2 = require("../jobs/queue2v2Scheduler");

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    const serverId = process.env.GUILD_ID;

    // 1) Hard reset all queues on startup (so no one is unintentionally queued)
    try {
      const delRes = await QueueEntry.deleteMany({ serverId });
      await QueueState.updateMany(
        { serverId },
        { $set: { pendingWindowEndAt: null } }
      );

      console.log(
        `[Queue Reset] Cleared ${delRes.deletedCount} queued entries and reset queue windows.`
      );
    } catch (e) {
      console.error("Queue reset on startup failed:", e);
    }

    // 2) Rebuild / refresh panels
    await ensurePanel(client); // 1v1 queue panel
    try {
      await refreshPanel(client);
    } catch {}

    try {
      await ensure2v2Panel(client); // 2v2 queue panel
      await refresh2v2Panel(client);
    } catch (err) {
      console.error("Failed to setup 2v2 panel:", err);
    }

    try {
      await ensurePayoutPanel(client); // cash out panel
    } catch {}

    try {
      await ensureTicketPurchasePanel(client); // ticket purchase panel
    } catch {}

    try {
      await ensureLeaderboardPanel(client); // leaderboard panel
    } catch {}

    try {
      await upsertCatalogPanel(client, "all", 0); // prize catalog panel
    } catch (err) {
      console.error("Failed to setup catalog panel:", err);
    }

    try {
      await upsertToSPanel(client); // ToS acceptance panel
    } catch (err) {
      console.error("Failed to setup ToS panel:", err);
    }

    try {
      await ensureMatchmakingPanel(client); // 1v1 matchmaking panel
    } catch (err) {
      console.error("Failed to setup matchmaking panel:", err);
    }

    try {
      const { ensureChallengePanel } = require("../components/challengePanel");
      await ensureChallengePanel(client); // challenge panel
    } catch (err) {
      console.error("Failed to setup challenge panel:", err);
    }

    // 3) Start the scheduler heartbeats
    scheduler.start(client); // 1v1 queue scheduler
    scheduler2v2.start(client); // 2v2 queue scheduler

    // 4) Auto-refresh leaderboard every 5 minutes
    setInterval(async () => {
      try {
        const {
          refreshLeaderboard,
        } = require("../components/leaderboardPanel");
        await refreshLeaderboard(client);
      } catch (err) {
        console.error("Leaderboard auto-refresh failed:", err);
      }
    }, 5 * 60 * 1000); // 5 minutes

    console.log("✅ All systems ready!");
  },
};
