// components/matchReport.js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

/**
 * Create match result reporting buttons
 */
function createReportButtons(
  matchId,
  playerA,
  playerB,
  playerAName,
  playerBName
) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`REPORT_WIN_${matchId}_${playerA}`)
      .setLabel(`${playerAName} Won`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`REPORT_WIN_${matchId}_${playerB}`)
      .setLabel(`${playerBName} Won`)
      .setStyle(ButtonStyle.Success)
  );

  return [row];
}

/**
 * Create the match report embed
 */
function createReportEmbed(playerA, playerB, matchId, selectedMap) {
  return new EmbedBuilder()
    .setTitle("📊 Report Match Result")
    .setDescription(
      `**Map:** ${selectedMap}\n\n` +
        `Click the button below to report who won this match.\n` +
        `Both players should agree on the outcome.`
    )
    .setColor(0x5865f2)
    .addFields(
      { name: "Player 1", value: `<@${playerA}>`, inline: true },
      { name: "Player 2", value: `<@${playerB}>`, inline: true },
      { name: "Match ID", value: matchId, inline: false }
    )
    .setFooter({ text: "Click a button to report the winner" });
}

/**
 * Create confirmation embed after win is reported
 */
function createConfirmationEmbed(winnerId, loserId, reporterId) {
  return new EmbedBuilder()
    .setTitle("⏳ Win Report Pending Confirmation")
    .setDescription(
      `<@${reporterId}> reported that <@${winnerId}> won.\n\n` +
        `Waiting for confirmation from <@${loserId}>...`
    )
    .setColor(0xfee75c)
    .setFooter({ text: "The opponent must confirm or dispute this result" });
}

/**
 * Create dispute buttons
 */
function createDisputeButtons(matchId, winnerId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`CONFIRM_WIN_${matchId}_${winnerId}`)
      .setLabel("Confirm Result")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`DISPUTE_WIN_${matchId}`)
      .setLabel("Dispute Result")
      .setStyle(ButtonStyle.Danger)
  );

  return [row];
}

/**
 * Create final result embed
 */
function createFinalResultEmbed(winnerId, loserId) {
  return new EmbedBuilder()
    .setTitle("✅ Match Complete!")
    .setDescription(
      `**Winner:** <@${winnerId}> 🏆\n` +
        `**Opponent:** <@${loserId}>\n\n` +
        `GG! The bracket has been updated.`
    )
    .setColor(0x57f287)
    .setTimestamp();
}

module.exports = {
  createReportButtons,
  createReportEmbed,
  createConfirmationEmbed,
  createDisputeButtons,
  createFinalResultEmbed,
};
