// services/tournament2v2Service.js
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const Team = require("../models/Team");
const QueueEntry2v2 = require("../models/QueueEntry2v2");
const Profile = require("../models/profileSchema");
const Tournament = require("../models/Tournament");
const Match = require("../models/Match");
const TIERS = require("../config/tiers");
const {
  recordTournamentParticipation,
  recordTournamentWin,
} = require("./statsService");
const { BRACKET_STATES } = require("../config/constants");

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

/* --------------------------- match channels ------------------------------ */

async function createMatchChannel(guild, teamA, teamB, match) {
  const teamAName = teamA.teamName.slice(0, 15).replace(/[^a-zA-Z0-9]/g, "");
  const teamBName = teamB.teamName.slice(0, 15).replace(/[^a-zA-Z0-9]/g, "");

  // Get all 4 players who need access
  const allPlayers = [...teamA.players, ...teamB.players];

  // Pre-fetch members to cache them
  const fetchedMembers = [];
  for (const uid of allPlayers) {
    try {
      const member = await guild.members.fetch(uid);
      fetchedMembers.push(member);
    } catch (err) {
      console.error(`Failed to fetch member ${uid}:`, err);
    }
  }

  // Build permission overwrites
  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];

  for (const member of fetchedMembers) {
    permissionOverwrites.push({
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ],
    });
  }

  const chan = await guild.channels.create({
    name: `2v2-${teamAName}-vs-${teamBName}`.toLowerCase(),
    type: ChannelType.GuildText,
    parent: MATCH_CATEGORY_ID,
    permissionOverwrites,
  });

  match.channelId = chan.id;
  await match.save();

  // Initialize map pick/ban phase (team captains ban)
  const MapPickBan = require("../models/MapPickBan");
  const {
    createMapPickBanEmbed,
    createMapBanButtons,
  } = require("../components/mapPickBan");

  const captainA = teamA.players[0];
  const captainB = teamB.players[0];

  const banOrder = [captainA, captainB];
  const pickBan = await MapPickBan.create({
    matchId: match.id,
    playerA: captainA,
    playerB: captainB,
    bannedMaps: [],
    currentBanner: banOrder[0],
    banOrder: banOrder,
  });

  // Send pick/ban interface
  const embed = createMapPickBanEmbed(captainA, captainB, [], banOrder[0]);
  const buttons = createMapBanButtons([], false);

  const teamAMentions = teamA.players.map((p) => `<@${p}>`).join(" & ");
  const teamBMentions = teamB.players.map((p) => `<@${p}>`).join(" & ");

  const msg = await chan.send({
    content:
      `**Round ${match.round}** • **2v2 Wingman Match**\n\n` +
      `**${teamA.teamName}:** ${teamAMentions}\n` +
      `**VS**\n` +
      `**${teamB.teamName}:** ${teamBMentions}\n\n` +
      `🗺️ **Map Pick/Ban Phase** - Team captains ban maps.`,
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

/* --------------------------- bracket formation --------------------------- */

async function formBracket2v2(serverId, tierKey, targetSize = null) {
  const tier = TIERS.find((t) => t.key === tierKey);
  if (!tier) return null;

  const queuedEntries = await QueueEntry2v2.find({ serverId, tierKey })
    .sort({ joinedAt: 1 })
    .limit(16);

  if (queuedEntries.length < 2) return null;

  const teams = await Promise.all(
    queuedEntries.map((e) => Team.findById(e.teamId))
  );

  const preMadeTeams = teams.filter((t) => t && t.partnerId);
  const soloPlayers = teams.filter((t) => t && !t.partnerId);

  const pairedSolos = [];
  for (let i = 0; i < soloPlayers.length - 1; i += 2) {
    const team1 = soloPlayers[i];
    const team2 = soloPlayers[i + 1];

    team1.partnerId = team2.leaderId;
    team1.teamName = `${team1.teamName} + ${team2.teamName}`;
    team1.status = "ready";
    await team1.save();

    team2.status = "disbanded";
    await team2.save();

    pairedSolos.push(team1);
  }

  let readyTeams = [...preMadeTeams, ...pairedSolos];

  if (readyTeams.length < 2) return null;

  let finalSize;
  if (targetSize) {
    finalSize = targetSize;
  } else {
    finalSize = readyTeams.length >= 4 ? 4 : 2;
  }

  while (readyTeams.length > finalSize) readyTeams.pop();
  if (readyTeams.length % 2 === 1) readyTeams.pop();

  if (readyTeams.length < 2) return null;

  const eligibleTeams = [];
  for (const team of readyTeams) {
    const leaderProfile = await Profile.findOne({
      serverId,
      userId: team.leaderId,
    });
    const partnerProfile = await Profile.findOne({
      serverId,
      userId: team.partnerId,
    });

    const leaderBalance = leaderProfile?.balance ?? 0;
    const partnerBalance = partnerProfile?.balance ?? 0;

    if (leaderBalance >= tier.cost && partnerBalance >= tier.cost) {
      eligibleTeams.push({
        team,
        leaderProfile,
        partnerProfile,
      });
    }
  }

  if (eligibleTeams.length < 2) return null;

  const chargedTeams = [];
  const allUserIds = [];
  for (const { team, leaderProfile, partnerProfile } of eligibleTeams) {
    leaderProfile.balance -= tier.cost;
    await leaderProfile.save();

    partnerProfile.balance -= tier.cost;
    await partnerProfile.save();

    chargedTeams.push(team);
    allUserIds.push(team.leaderId, team.partnerId);
  }

  await QueueEntry2v2.deleteMany({
    teamId: { $in: chargedTeams.map((t) => t.id) },
  });

  for (const team of chargedTeams) {
    team.queuedFor = null;
    await team.save();
  }

  const bracketSize = chargedTeams.length * 2;

  return {
    tierKey,
    size: bracketSize,
    userIds: allUserIds,
    teams: chargedTeams.map((t) => ({
      teamId: t.id,
      teamName: t.teamName,
      players: [t.leaderId, t.partnerId],
    })),
  };
}

/* -------------------------- tournament lifecycle ------------------------- */

async function createTournament2v2(
  client,
  serverId,
  tierKey,
  size,
  userIds,
  teamsMetadata
) {
  const guild = await client.guilds.fetch(serverId);

  const fetchedMembers = [];
  for (const uid of userIds) {
    try {
      const member = await guild.members.fetch(uid);
      fetchedMembers.push(member);
    } catch (err) {
      console.error(`Failed to fetch member ${uid}:`, err);
    }
  }

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
  ];

  for (const member of fetchedMembers) {
    permissionOverwrites.push({
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ],
    });
  }

  const tourneyChan = await guild.channels.create({
    name: `2v2-tourney-${Date.now().toString().slice(-6)}`,
    type: ChannelType.GuildText,
    parent: TOURNEY_CATEGORY_ID,
    permissionOverwrites,
  });

  const roundCount = teamsMetadata.length === 4 ? 2 : 1;

  const tournament = await Tournament.create({
    serverId,
    tierKey,
    size,
    playerIds: userIds,
    tournamentChannelId: tourneyChan.id,
    state: BRACKET_STATES.ACTIVE,
    currentRound: 1,
    roundCount,
    gameMode: "2v2",
    teamsMetadata,
  });

  await recordTournamentParticipation(serverId, userIds);

  // Create matches TEAM vs TEAM (not player vs player)
  for (let i = 0; i < teamsMetadata.length; i += 2) {
    const teamA = teamsMetadata[i];
    const teamB = teamsMetadata[i + 1];

    const m = await Match.create({
      serverId,
      tournamentId: tournament.id,
      round: 1,
      playerA: teamA.players[0], // Team captain
      playerB: teamB.players[0], // Team captain
      gameMode: "2v2",
      teamA: teamA.players,
      teamB: teamB.players,
      teamAName: teamA.teamName,
      teamBName: teamB.teamName,
    });

    await createMatchChannel(guild, teamA, teamB, m);
  }

  const teamLines = teamsMetadata.map(
    (t) => `**${t.teamName}:** <@${t.players[0]}> & <@${t.players[1]}>`
  );

  await tourneyChan.send({
    embeds: [
      {
        title: `🎯 ${tierKey} 2v2 Tournament Started!`,
        description:
          `**Teams:** ${teamsMetadata.length}\n\n` +
          `🧩 **Matchups:**\n${teamLines.join("\n")}\n\n` +
          `Match channels have been created. Good luck!`,
        color: 0xff4747,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const playerMentions = userIds.map((id) => `<@${id}>`).join(" ");
  await tourneyChan.send(
    `${playerMentions} 🎮 **2v2 Wingman Tournament starting!** Check your match channels!`
  );

  await upsertBracket2v2Message(client, tournament.id);
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

  // Find which teams won
  const winningTeams = [];
  for (const winnerId of winners) {
    const team = tournament.teamsMetadata.find((t) =>
      t.players.includes(winnerId)
    );
    if (team) winningTeams.push(team);
  }

  // Create matches between winning teams
  for (let i = 0; i < winningTeams.length; i += 2) {
    const teamA = winningTeams[i];
    const teamB = winningTeams[i + 1];

    const m = await Match.create({
      serverId: tournament.serverId,
      tournamentId: tournament.id,
      round: nextRound,
      playerA: teamA.players[0],
      playerB: teamB.players[0],
      gameMode: "2v2",
      teamA: teamA.players,
      teamB: teamB.players,
      teamAName: teamA.teamName,
      teamBName: teamB.teamName,
    });

    await createMatchChannel(guild, teamA, teamB, m);
  }

  tournament.currentRound = nextRound;
  await tournament.save();

  const hub = await guild.channels.fetch(tournament.tournamentChannelId);
  const teamLines = winningTeams.map((t) => `**${t.teamName}**`).join(" vs ");

  await hub.send({
    embeds: [
      {
        title: `➡️ Round ${nextRound} Started`,
        description: `Matchup:\n${teamLines}`,
        color: 0x58a6ff,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  await upsertBracket2v2Message(client, tournament.id);
}

async function considerAdvanceOrFinish(client, tournamentId) {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) return;

  const matches = await Match.find({
    tournamentId,
    round: tournament.currentRound,
  });
  const allDone = matches.length > 0 && matches.every((m) => !!m.winnerId);
  if (!allDone) return;

  if (tournament.currentRound < tournament.roundCount) {
    await startNextRound(client, tournament);
    await upsertBracket2v2Message(client, tournament.id);
    return;
  }

  const finalMatch = matches[0];
  if (!finalMatch?.winnerId) return;

  tournament.winnerId = finalMatch.winnerId;
  tournament.state = BRACKET_STATES.COMPLETE;
  await tournament.save();

  // Find the winning team
  const winningTeam = tournament.teamsMetadata.find((t) =>
    t.players.includes(finalMatch.winnerId)
  );

  if (!winningTeam) {
    console.error("Could not find winning team!");
    return;
  }

  // Calculate total cash payout: entries * tier.cost * 0.8 (20% rake)
  const tier = TIERS.find((t) => t.key === tournament.tierKey);
  const cost = tier ? tier.cost : 1;
  const totalPayout = tournament.size * cost * 0.8;

  // Split cash payout 50/50 between teammates
  const payoutPerPlayer = totalPayout / 2;

  // Award cash to both players
  for (const playerId of winningTeam.players) {
    const playerProfile = await Profile.findOne({
      serverId: tournament.serverId,
      userId: playerId,
    });

    if (playerProfile) {
      playerProfile.winningsBalance = (playerProfile.winningsBalance ?? 0) + payoutPerPlayer;
      await playerProfile.save();
    }

    // Record tournament win in stats for both players
    await recordTournamentWin(tournament.serverId, playerId, payoutPerPlayer);
  }

  const { refreshLeaderboard } = require("../components/leaderboardPanel");
  await refreshLeaderboard(client);

  // Announce with team name and both players
  try {
    const guild = await client.guilds.fetch(tournament.serverId);
    const hub = await guild.channels.fetch(tournament.tournamentChannelId);

    const player1Mention = `<@${winningTeam.players[0]}>`;
    const player2Mention = `<@${winningTeam.players[1]}>`;

    await hub.send(
      `🏆 **2v2 Tournament Complete!**\n\n` +
        `**Winning Team:** ${winningTeam.teamName}\n` +
        `**Players:** ${player1Mention} & ${player2Mention}\n\n` +
        `**Total Payout:** $${totalPayout.toFixed(2)} 💰\n` +
        `**Each Player Receives:** $${payoutPerPlayer.toFixed(2)}\n\n` +
        `Congratulations! Cash has been added to your winnings balance! 🎉`
    );
  } catch (err) {
    console.error("Failed to announce 2v2 winner:", err);
  }

  await upsertBracket2v2Message(client, tournament.id);

  try {
    const guild = await client.guilds.fetch(tournament.serverId);
    const hub = await guild.channels.fetch(tournament.tournamentChannelId);

    setTimeout(async () => {
      try {
        await hub.send(
          "🔒 This tournament has concluded. Closing the channel shortly..."
        );
        await hub.permissionOverwrites.edit(guild.roles.everyone, {
          ViewChannel: false,
        });
        setTimeout(() => hub.delete().catch(() => {}), 15_000);
      } catch (err) {
        console.warn("Failed to close 2v2 tournament channel:", err);
      }
    }, 60 * 1000);
  } catch (err) {
    console.warn("2v2 tournament close handler error:", err);
  }
}

async function upsertBracket2v2Message(client, tournamentId) {
  const t = await Tournament.findById(tournamentId);
  if (!t) return;

  const guild = await client.guilds.fetch(t.serverId);
  const channel = await guild.channels.fetch(t.tournamentChannelId);

  const matches = await Match.find({ tournamentId }).sort({
    round: 1,
    createdAt: 1,
  });

  let bracketText = "```\n";

  const teamCount = t.teamsMetadata.length;

  if (teamCount === 2) {
    // Single match bracket
    const m = matches[0];
    const teamA = t.teamsMetadata.find((tm) => tm.players.includes(m.playerA));
    const teamB = t.teamsMetadata.find((tm) => tm.players.includes(m.playerB));

    const nameA = teamA ? teamA.teamName : "Team A";
    const nameB = teamB ? teamB.teamName : "Team B";

    const winnerMark = m.winnerId ? (m.winnerId === m.playerA ? " ✓" : "") : "";
    const loserMark = m.winnerId ? (m.winnerId === m.playerB ? " ✓" : "") : "";

    bracketText += `FINAL\n\n`;
    bracketText += `${nameA}${winnerMark}\n`;
    bracketText += `  VS\n`;
    bracketText += `${nameB}${loserMark}\n`;
  } else if (teamCount === 4) {
    // 4-team bracket
    const r1 = matches.filter((m) => m.round === 1);
    const r2 = matches.filter((m) => m.round === 2);

    bracketText += `ROUND 1              FINAL\n\n`;

    if (r1[0]) {
      const m = r1[0];
      const teamA = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerA)
      );
      const teamB = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerB)
      );
      const nameA = teamA ? teamA.teamName.slice(0, 15) : "Team A";
      const nameB = teamB ? teamB.teamName.slice(0, 15) : "Team B";

      bracketText += `${nameA}${m.winnerId === m.playerA ? " ✓" : ""}\n`;
      bracketText += `  VS\n`;
      bracketText += `${nameB}${m.winnerId === m.playerB ? " ✓" : ""}\n`;
    }

    if (r2[0]) {
      const m = r2[0];
      const teamA = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerA)
      );
      const teamB = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerB)
      );
      const nameA = teamA ? teamA.teamName.slice(0, 15) : "Winner 1";
      const nameB = teamB ? teamB.teamName.slice(0, 15) : "Winner 2";

      bracketText += `\n       ──>  ${nameA}${
        m.winnerId === m.playerA ? " ✓" : ""
      }\n`;
      bracketText += `              VS\n`;
      bracketText += `            ${nameB}${
        m.winnerId === m.playerB ? " ✓" : ""
      }\n`;
    }

    if (r1[1]) {
      const m = r1[1];
      const teamA = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerA)
      );
      const teamB = t.teamsMetadata.find((tm) =>
        tm.players.includes(m.playerB)
      );
      const nameA = teamA ? teamA.teamName.slice(0, 15) : "Team C";
      const nameB = teamB ? teamB.teamName.slice(0, 15) : "Team D";

      bracketText += `\n${nameA}${m.winnerId === m.playerA ? " ✓" : ""}\n`;
      bracketText += `  VS\n`;
      bracketText += `${nameB}${m.winnerId === m.playerB ? " ✓" : ""}\n`;
    }
  }

  bracketText += "```";

  const payload = {
    embeds: [
      {
        title: "🧩 2v2 Bracket",
        description: `**Teams:** ${teamCount} • **Round ${t.currentRound}/${t.roundCount}**`,
        color: 0x2f3136,
        fields: [{ name: "\u200b", value: bracketText }],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    const existing = msgs.find(
      (m) =>
        m.author.id === channel.client.user.id &&
        m.embeds?.[0]?.title?.startsWith("🧩")
    );

    if (existing) {
      await existing.edit(payload);
    } else {
      await channel.send(payload);
    }
  } catch (err) {
    console.error("Failed to upsert 2v2 bracket:", err);
  }
}

module.exports = {
  formBracket2v2,
  createTournament2v2,
  considerAdvanceOrFinish,
  closeMatchChannel,
};
