const { refreshPanel } = require("../Components/queuePanel");
const { checkAndFormBracket } = require("../services/queueService");
const { createTournament } = require("../services/tournamentService");

let interval = null;

function start(client) {
  if (interval) return;
  interval = setInterval(async () => {
    try {
      const serverId = process.env.GUILD_ID;
      const ops = await checkAndFormBracket(serverId);
      for (const op of ops) {
        await createTournament(
          client,
          serverId,
          op.tierKey,
          op.size,
          op.userIds
        );
      }
      if (ops.length > 0) await refreshPanel(client);
    } catch (e) {
      console.error("queueScheduler tick error:", e);
    }
  }, 10_000); // every 10s
}

module.exports = { start };
