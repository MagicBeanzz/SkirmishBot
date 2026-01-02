const Match = require("../models/Match");
const Tournament = require("../models/Tournament");
const { MATCH_STATES } = require("../config/constants");
const { upsertBracketMessage } = require("../services/bracketService");

async function reportWin(client, matchId, winnerId) {
  const match = await Match.findById(matchId);
  if (!match) return { ok: false, msg: "Match not found." };

  if (match.state === MATCH_STATES.COMPLETE || match.winnerId) {
    return { ok: false, msg: "This match has already been reported." };
  }

  if (![match.playerA, match.playerB].includes(winnerId)) {
    return { ok: false, msg: "You are not a player in this match." };
  }

  match.winnerId = winnerId;
  match.state = MATCH_STATES.COMPLETE;
  await match.save();

  // Get tournament to determine game mode
  const tournament = await Tournament.findById(match.tournamentId);

  // Route to correct service based on game mode
  if (tournament && tournament.gameMode === "2v2") {
    // Use 2v2 service
    const {
      considerAdvanceOrFinish: considerAdvanceOrFinish2v2,
      closeMatchChannel: closeMatchChannel2v2,
    } = require("./tournament2v2Service");

    await upsertBracketMessage(client, match.tournamentId);
    await closeMatchChannel2v2(client, match, winnerId);
    await considerAdvanceOrFinish2v2(client, match.tournamentId);
  } else {
    // Use 1v1 service
    const {
      considerAdvanceOrFinish,
      closeMatchChannel,
    } = require("./tournamentService");

    await upsertBracketMessage(client, match.tournamentId);
    await closeMatchChannel(client, match, winnerId);
    await considerAdvanceOrFinish(client, match.tournamentId);
  }

  const loserId = winnerId === match.playerA ? match.playerB : match.playerA;
  return {
    ok: true,
    msg: `Winner recorded: <@${winnerId}>. GG <@${loserId}>.`,
  };
}

module.exports = { reportWin };
