const Tournament = require("../models/Tournament");
const Match = require("../models/Match");

/* =============================================================================
   1) SMALL UTILITIES (pure helpers)
   ========================================================================== */

/** Safe spaces */
const emptySpace = (n) => " ".repeat(Math.max(0, n));

/** Pad/crop to a fixed width (keeps monospace columns aligned) */
const NAME_WIDTH_4 = 14; // Default width used for all names based on number of players
const NAME_WIDTH_8 = 10; // Default width used for all names based on number of players
function pad(text, width) {
  const s = String(text ?? "");
  return s.length >= width
    ? s.slice(0, width)
    : s + " ".repeat(width - s.length);
}

/** Add a ✓ to the winner at the round node (cosmetic only) */
function mark(name, winnerId, userId) {
  return winnerId && userId === winnerId
    ? `${pad(name, NAME_WIDTH_4 - 2)} ✓`
    : pad(name, NAME_WIDTH_4);
}

/* =============================================================================
   2) DISCORD/NAMES HELPERS (guild lookups)
   ========================================================================== */

/** Get a member's displayName, fallback to "Unknown (id)" */
async function displayName(guild, userId) {
  try {
    const m = await guild.members.fetch(userId);
    return m.displayName;
  } catch {
    return `Unknown (${userId})`;
  }
}

/** Build a map of userId -> displayName for all IDs we will render */
async function buildNameMap(guild, ids) {
  const map = {};
  for (const id of new Set(ids.filter(Boolean))) {
    map[id] = await displayName(guild, id);
  }
  return map;
}

/** Group matches by round for quick access */
function groupMatchesByRound(matches) {
  return matches.reduce((acc, m) => {
    (acc[m.round] ||= []).push(m);
    return acc;
  }, {});
}

/* =============================================================================
   3) ASCII RENDERERS (4-player & 8-player)
   ========================================================================== */

/**
 * Render a **4-player** bracket.
 * R1: show only pairs + local TBDs (no finals preview)
 * R2: winners replace local TBDs, short arms to the right, **NO CENTER TEE** (requested)
 */
function renderBracket4(names, byRound, currentRound) {
  const WIN_PREFIX = `${emptySpace(NAME_WIDTH_4)}  ├─ `; // shared prefix for "winner/TBD" rows

  const r1 = byRound[1] || [];
  const m1 = r1[0] || {};
  const m2 = r1[1] || {};

  // Left column labels (with ✓ at the round node)
  const rawA = names[m1.playerA] || "TBD";
  const rawB = names[m1.playerB] || "TBD";
  const rawC = names[m2.playerA] || "TBD";
  const rawD = names[m2.playerB] || "TBD";

  const A = mark(rawA, m1.winnerId, m1.playerA);
  const B = mark(rawB, m1.winnerId, m1.playerB);
  const C = mark(rawC, m2.winnerId, m2.playerA);
  const D = mark(rawD, m2.winnerId, m2.playerB);

  // R1 winners (padded so both finals arms align horizontally)
  const W1pad = pad(m1.winnerId ? names[m1.winnerId] : "TBD", NAME_WIDTH_4);
  const W2pad = pad(m2.winnerId ? names[m2.winnerId] : "TBD", NAME_WIDTH_4);

  // Round 2 / Final info
  const r2 = byRound[2] || [];
  const f = r2[0] || {};
  const championLabel = f.winnerId
    ? `${pad(names[f.winnerId], NAME_WIDTH_4)}🏆`
    : "TBD";

  // Arm length is computed so the line fits comfortably in embeds.
  const showFinal = currentRound > 1;

  // ---------------------------------------------------------------------------
  // Compose the ASCII lines
  // ---------------------------------------------------------------------------
  const L = [];
  L.push(`ROUND 1${emptySpace(26)}FINAL`);

  // TOP pair
  L.push(`${A} ─┐  `);
  L.push(
    `${WIN_PREFIX}` +
      (showFinal ? `${W1pad} ─┐` : `${pad("TBD", NAME_WIDTH_4)}`)
  );
  L.push(`${B} ─┘  ` + (showFinal ? `${emptySpace(NAME_WIDTH_4)}  |` : ``));

  // Spacer between the two Round-1 matches
  if (showFinal) {
    L.push(`${emptySpace(WIN_PREFIX.length)}${WIN_PREFIX}${championLabel}`);
  } else {
    L.push(``);
  }

  // BOTTOM pair (suppress literal "TBD" participant rows in R2 so no stray TBDs)
  L.push(`${C} ─┐  ` + (showFinal ? `${emptySpace(NAME_WIDTH_4)}  |` : ``));
  L.push(
    `${WIN_PREFIX}` +
      (showFinal ? `${W2pad} ─┘` : `${pad("TBD", NAME_WIDTH_4)}`)
  );
  L.push(`${D} ─┘  `);

  // NOTE: We **do not** insert a tee (├) line between the two finals arms.
  // This was the source of the stray "tee" artifact you circled. The two arms
  // simply end with ┐ and ┘, and the champion label is omitted until set.
  // If you'd like the label shown without a tee, we can place it inline
  // after the *top* arm—just ask and we'll add a tiny right margin & text.

  return "```" + L.join("\n") + "```";
}

/**
 * Render an **8-player** bracket.
 * R1: only local pairs + TBDs
 * R2: semis winners in place + short semis arms (no tee artifacts)
 * R3: final (short arms). By default we also omit the center tee for visual parity.
 */
function renderBracket8(names, byRound, currentRound) {
  const r1 = byRound[1] || [];
  const [m1, m2, m3, m4] = [0, 1, 2, 3].map((i) => r1[i] || {});

  const mk = (m) => {
    const ra = names[m.playerA] || "TBD";
    const rb = names[m.playerB] || "TBD";
    return {
      Araw: ra,
      Braw: rb,
      A: pad(mark(ra, m.winnerId, m.playerA), NAME_WIDTH_4),
      B: pad(mark(rb, m.winnerId, m.playerB), NAME_WIDTH_4),
      W: pad(m.winnerId ? names[m.winnerId] : "TBD", NAME_WIDTH_4),
    };
  };
  const [p1, p2, p3, p4] = [mk(m1), mk(m2), mk(m3), mk(m4)];

  const r2 = byRound[2] || [];
  const s1 = r2[0] || {};
  const s2 = r2[1] || {};
  const S1 = s1.winnerId ? names[s1.winnerId] : "TBD";
  const S2 = s2.winnerId ? names[s2.winnerId] : "TBD";

  const r3 = byRound[3] || [];
  const f = r3[0] || {};
  const championLabel = f.winnerId ? `${names[f.winnerId]}🏆` : "TBD";

  const showSemis = currentRound > 1;
  const showFinal = currentRound > 2;

  const baseBeforeArms = WIN_PREFIX.length + NAME_WIDTH_4 + 1;
  const SEMI_ARM = 0;

  const FINAL_ARM = 0;

  const L = [];
  L.push(`ROUND 1${emptySpace(24)}SEMIFINALS${emptySpace(18)}FINAL`);

  // Upper half (to S1)
  L.push(`${p1.A} ─┐`);
  L.push(
    showSemis
      ? `${WIN_PREFIX}${p1.W} ${"─".repeat(SEMI_ARM)}┐`
      : `${WIN_PREFIX}${pad("TBD", NAME_WIDTH_4)}`
  );
  L.push(`${p1.B} ─┘`);
  L.push(``);
  L.push(`${p2.A} ─┐`);
  L.push(
    showSemis
      ? `${WIN_PREFIX}${p2.W} ${"─".repeat(SEMI_ARM)}┘`
      : `${WIN_PREFIX}${pad("TBD", NAME_WIDTH_4)}`
  );
  L.push(`${p2.B} ─┘`);

  // Small spacer between halves
  L.push(``);
  L.push(``);

  // Lower half (to S2) — hide literal TBD participant rows in later rounds
  if (!(showSemis && p3.Araw === "TBD")) L.push(`${p3.A} ─┐`);
  L.push(
    showSemis
      ? `${WIN_PREFIX}${p3.W} ${"─".repeat(SEMI_ARM)}┐`
      : `${WIN_PREFIX}${pad("TBD", NAME_WIDTH_4)}`
  );
  if (!(showSemis && p3.Braw === "TBD")) L.push(`${p3.B} ─┘`);
  L.push(``);
  if (!(showSemis && p4.Araw === "TBD")) L.push(`${p4.A} ─┐`);
  L.push(
    showSemis
      ? `${WIN_PREFIX}${p4.W} ${"─".repeat(SEMI_ARM)}┘`
      : `${WIN_PREFIX}${pad("TBD", NAME_WIDTH_4)}`
  );
  if (!(showSemis && p4.Braw === "TBD")) L.push(`${p4.B} ─┘`);

  // Final (optional): for visual parity with 4-player, we do **not** draw a center tee.
  // If you want it, we can add the same (now-safe) inline method as in 4-player.
  if (showFinal) {
    L.push(``);
    L.push(`${WIN_PREFIX}${pad(S1, NAME_WIDTH_4)} ${" ".repeat(FINAL_ARM)}┐`);
    L.push(`${WIN_PREFIX}${pad(S2, NAME_WIDTH_4)} ${" ".repeat(FINAL_ARM)}┘`);
    // No tee/label line inserted; avoids wrap artifacts in narrow clients.
  }

  return "```" + L.join("\n") + "```";
}

/* =============================================================================
   4) MESSAGE FIND/UPSERT (sends or edits the bracket embed)
   ========================================================================== */

/** Find the existing bracket embed we own in this channel (if any) */
async function findExistingBracketMessage(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    return (
      msgs.find(
        (m) =>
          m.author.id === channel.client.user.id &&
          m.embeds?.[0]?.title?.startsWith("🧩 Bracket")
      ) || null
    );
  } catch {
    return null;
  }
}

/** Public: create or update the bracket embed for a tournament */
async function upsertBracketMessage(client, tournamentId) {
  // --- fetch tournament + channel context
  const t = await Tournament.findById(tournamentId);
  if (!t) return;

  const guild = await client.guilds.fetch(t.serverId);
  const channel = await guild.channels.fetch(t.tournamentChannelId);

  // --- gather matches, names, and group by round
  const matches = await Match.find({ tournamentId }).sort({
    round: 1,
    createdAt: 1,
  });
  const byRound = groupMatchesByRound(matches);
  const ids = matches.flatMap((m) => [m.playerA, m.playerB, m.winnerId]);
  const names = await buildNameMap(guild, ids);

  // --- render bracket block text
  const block =
    t.size === 4
      ? renderBracket4(names, byRound, t.currentRound)
      : renderBracket8(names, byRound, t.currentRound);

  // --- embed payload
  const payload = {
    embeds: [
      {
        title: "🧩 Bracket",
        description: `SIZE: **${t.size}** • ROUND **${t.currentRound}/${t.roundCount}**`,
        color: 0x2f3136,
        fields: [{ name: "\u200b", value: block }],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  // --- upsert (edit if present, otherwise send)
  const existing = await findExistingBracketMessage(channel);
  if (existing) await existing.edit(payload);
  else await channel.send(payload);
}

/* =============================================================================
   5) EXPORTS
   ========================================================================== */
module.exports = { upsertBracketMessage };
