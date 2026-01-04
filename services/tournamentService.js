const { ChannelType, PermissionFlagsBits } = require("discord.js");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const Profile = require("../models/profileSchema");
const { BRACKET_STATES } = require("../config/constants");
const TIERS = require("../config/tiers");
const { upsertBracketMessage } = require("./bracketService");

const TOURNEY_CATEGORY_ID = process.env.TOURNEY_CATEGORY_ID;
const MATCH_CATEGORY_ID = process.env.MATCH_CATEGORY_ID;

/* ------------------------------ helpers ---------------------------------- */

async function safeDisplayName(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m.displayName;
  } catch {
    return `Unknown (${userId})`;
  }
}

function seedPairs(userIds) {
  const pairs = [];
  for (let i = 0; i < userIds.length; i += 2)
    pairs.push([userIds[i], userIds[i + 1]]);
  return pairs;
}

async function prettyPairs(guild, userIdPairs) {
  const lines = [];
  for (const [a, b] of userIdPairs) {
    const A = await safeDisplayName(guild, a);
    const B = b ? await safeDisplayName(guild, b) : "BYE";
    lines.push(`• **${A}** vs **${B}**`);
  }
  return lines.join("\n");
}

/* --------------------------- match channels ------------------------------ */

async function createMatchChannel(guild, a, b, match) {
  const aName = (await safeDisplayName(guild, a))
    .slice(0, 10)
    .replace(/[^a-zA-Z0-9]/g, "");
  const bName = (await safeDisplayName(guild, b))
    .slice(0, 10)
    .replace(/[^a-zA-Z0-9]/g, "");

  const chan = await guild.channels.create({
    name: `match-${aName}-vs-${bName}`.toLowerCase(),
    type: ChannelType.GuildText,
    parent: MATCH_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: a,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
      {
        id: b,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
    ],
  });

  match.channelId = chan.id;
  await match.save();

  const A = await safeDisplayName(guild, a);
  const B = await safeDisplayName(guild, b);

  // Initialize map pick/ban phase
  const MapPickBan = require("../models/MapPickBan");
  const {
    createMapPickBanEmbed,
    createMapBanButtons,
  } = require("../components/mapPickBan");

  // Determine ban order (playerA bans first)
  const banOrder = [a, b];
  const pickBan = await MapPickBan.create({
    matchId: match.id,
    playerA: a,
    playerB: b,
    bannedMaps: [],
    currentBanner: banOrder[0],
    banOrder: banOrder,
  });

  // Send pick/ban interface
  const embed = createMapPickBanEmbed(a, b, [], banOrder[0]);
  const buttons = createMapBanButtons([], false);
  const msg = await chan.send({
    content: `**Round ${match.round}** • **${A}** vs **${B}**\n🗺️ **Map Pick/Ban Phase** - Each player bans one map, then the remaining map is selected.`,
    embeds: [embed],
    components: buttons,
  });

  pickBan.messageId = msg.id;
  await pickBan.save();

  return chan;
}

async function closeMatchChannel(client, match, winnerId) {
  if (!match.channelId) return;
  try {
    const chan = await client.channels.fetch(match.channelId);
    if (!chan) return;
    const winnerName = await safeDisplayName(chan.guild, winnerId);
    await chan.send(
      `✅ Result recorded. Winner: **${winnerName}**. This channel will close shortly.`
    );
    await chan.permissionOverwrites.edit(chan.guild.roles.everyone, {
      ViewChannel: false,
    });
    setTimeout(async () => {
      try {
        await chan.delete();
      } catch {}
    }, 20_000);
  } catch {}
}

/* -------------------------- tournament lifecycle ------------------------- */

async function createTournament(client, serverId, tierKey, size, userIds) {
  const guild = await client.guilds.fetch(serverId);

  const tourneyChan = await guild.channels.create({
    name: `tourney-${Date.now().toString().slice(-6)}`,
    type: ChannelType.GuildText,
    parent: TOURNEY_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...userIds.map((uid) => ({
        id: uid,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      })),
    ],
  });

  const roundCount = size === 8 ? 3 : 2;

  const tournament = await Tournament.create({
    serverId,
    tierKey,
    size,
    playerIds: userIds,
    tournamentChannelId: tourneyChan.id,
    state: BRACKET_STATES.ACTIVE,
    currentRound: 1,
    roundCount,
  });

  // Record tournament participation for stats
  const { recordTournamentParticipation } = require("./statsService");
  await recordTournamentParticipation(serverId, userIds);

  // Round 1 matches
  const pairs = seedPairs(userIds);
  for (const [a, b] of pairs) {
    const m = await Match.create({
      serverId,
      tournamentId: tournament.id,
      round: 1,
      playerA: a,
      playerB: b,
    });
    await createMatchChannel(guild, a, b, m);
  }

  // Post bracket summary
  const bracketText = await prettyPairs(guild, pairs);
  await tourneyChan.send({
    embeds: [
      {
        title: `🎯 ${tierKey} Tournament Started!`,
        description:
          `**Size:** ${size}\n\n🧩 **Round 1 Matchups:**\n${bracketText}\n` +
          `Match channels have been created. Good luck!`,
        color: 0xff4747,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  await upsertBracketMessage(client, tournament.id);
  return tournament;
}

async function getRoundWinners(tournamentId, round) {
  const matches = await Match.find({ tournamentId, round });
  const winners = [];
  for (const m of matches) if (m.winnerId) winners.push(m.winnerId);
  return { winners, matchCount: matches.length };
}

async function startNextRound(client, tournament) {
  const guild = await client.guilds.fetch(tournament.serverId);
  const nextRound = tournament.currentRound + 1;

  const { winners } = await getRoundWinners(
    tournament.id,
    tournament.currentRound
  );
  const pairs = seedPairs(winners);

  for (const [a, b] of pairs) {
    const m = await Match.create({
      serverId: tournament.serverId,
      tournamentId: tournament.id,
      round: nextRound,
      playerA: a,
      playerB: b,
    });
    await createMatchChannel(guild, a, b, m);
  }

  tournament.currentRound = nextRound;
  await tournament.save();

  const hub = await guild.channels.fetch(tournament.tournamentChannelId);
  const bracketText = await prettyPairs(guild, pairs);
  await hub.send({
    embeds: [
      {
        title: `➡️ Round ${nextRound} Started`,
        description: `Matchups:\n${bracketText}`,
        color: 0x58a6ff,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  await upsertBracketMessage(client, tournament.id);
}

/**
 * Called after each match confirmation:
 * - If all matches in current round complete:
 *   - advance to next round, or
 *   - finish tournament, compute payout, credit winner's winningsBalance
 */
async function considerAdvanceOrFinish(client, tournamentId) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) return;

  const matches = await Match.find({
    tournamentId,
    round: tournament.currentRound,
  });
  const allDone = matches.length > 0 && matches.every((m) => !!m.winnerId);
  if (!allDone) return;

  // Not at the final yet -> advance
  if (tournament.currentRound < tournament.roundCount) {
    await startNextRound(client, tournament);
    await upsertBracketMessage(client, tournament.id);
    return;
  }

  // Final completed -> finish & pay out
  const finalMatch = matches[0];
  if (!finalMatch?.winnerId) return;

  tournament.winnerId = finalMatch.winnerId;
  tournament.state = BRACKET_STATES.COMPLETE;
  await tournament.save();

  // Compute cash payout: entries * tier.cost * 0.8 (20% rake)
  const tier = TIERS.find((t) => t.key === tournament.tierKey);
  const cost = tier ? tier.cost : 1;
  const payout = tournament.size * cost * 0.8; // Winner gets 80% of total entry fees

  const winnerProfile = await Profile.findOne({
    serverId: tournament.serverId,
    userId: finalMatch.winnerId,
  });
  if (winnerProfile) {
    winnerProfile.winningsBalance = (winnerProfile.winningsBalance ?? 0) + payout;
    await winnerProfile.save();
  }

  // Record tournament win in stats
  const { recordTournamentWin } = require("./statsService");
  await recordTournamentWin(tournament.serverId, finalMatch.winnerId, payout);

  // Refresh leaderboard
  const { refreshLeaderboard } = require("../components/leaderboardPanel");
  await refreshLeaderboard(client);

  // Announce and refresh bracket
  try {
    const guild = await client.guilds.fetch(tournament.serverId);
    const hub = await guild.channels.fetch(tournament.tournamentChannelId);
    await hub.send(
      `🏆 **Tournament complete!** Winner: <@${
        finalMatch.winnerId
      }> — **$${payout.toFixed(2)}** added to winnings! 💰`
    );
  } catch {}

  await upsertBracketMessage(client, tournament.id);
  try {
    const guild = await client.guilds.fetch(tournament.serverId);
    const hub = await guild.channels.fetch(tournament.tournamentChannelId);

    // Wait a short period, then lock and delete
    setTimeout(async () => {
      try {
        await hub.send(
          "🏁 This tournament has concluded. Closing the channel shortly..."
        );
        await hub.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: false,
        });
        // Delete after 15 seconds of lock message
        setTimeout(() => hub.delete().catch(() => {}), 15_000);
      } catch (err) {
        console.warn("Failed to close tournament channel:", err);
      }
    }, 60 * 1000); // close 1 minute after winner announcement
  } catch (err) {
    console.warn("Tournament close handler error:", err);
  }
}

module.exports = {
  createTournament,
  considerAdvanceOrFinish,
  startNextRound,
  closeMatchChannel,
};
