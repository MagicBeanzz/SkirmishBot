const { EmbedBuilder } = require("discord.js");

const RULES_CHANNEL_ID = "1469542860612440199";
const PANEL_TITLE = "📜 1v1 SKIRMISH RULES";

/**
 * Build the rules embed
 */
function buildRulesEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Read these rules carefully before playing. Failure to follow them may result in a forfeit.",
    )
    .setColor(0xff4654);

  // Match Format
  embed.addFields({
    name: "⚔️ MATCH FORMAT",
    value:
      "```\n" +
      "• First to 10 rounds wins\n" +
      "• Best of 1 map\n" +
      "• Winner takes the combined prize pool\n" +
      "```",
    inline: false,
  });

  // Weapon Rules
  embed.addFields({
    name: "🔫 WEAPON RULES",
    value:
      "```\n" +
      "• Vandal OR Phantom ONLY\n" +
      "• No pistols\n" +
      "• No other weapons allowed\n" +
      "• Breaking weapon rules = FORFEIT\n" +
      "```",
    inline: false,
  });

  // Map Ban Process
  embed.addFields({
    name: "🗺️ MAP BAN PROCESS",
    value:
      "When matched, you'll enter a map ban phase:\n\n" +
      "1️⃣ **Player 1** bans a map\n" +
      "2️⃣ **Player 2** bans a map\n" +
      "3️⃣ Remaining map is played\n\n" +
      "*Map ban has a time limit - if you don't ban in time, a random map is selected.*",
    inline: false,
  });

  // Lobby Setup
  embed.addFields({
    name: "🎮 LOBBY SETUP",
    value:
      "**Higher seed (Player 1) creates the lobby:**\n\n" +
      "1. Add your opponent as a friend\n" +
      "2. Create a **Custom Game**\n" +
      "3. Select the map chosen from map ban\n" +
      "4. Set **Game Mode** to Standard\n" +
      "5. Set **Allow Cheats** to OFF\n" +
      "6. Set **Tournament Mode** to ON\n" +
      "7. Invite your opponent\n" +
      "8. Start when both ready",
    inline: false,
  });

  // Game Settings
  embed.addFields({
    name: "⚙️ REQUIRED GAME SETTINGS",
    value:
      "```\n" +
      "Mode:            Skirmish\n" +
      "Cheats:          OFF\n" +
      "Tournament Mode: ON\n" +
      "Overtime:        None\n" +
      "```",
    inline: false,
  });

  // Reporting Results
  embed.addFields({
    name: "📊 REPORTING RESULTS",
    value:
      "After the match:\n\n" +
      "1. Return to your match channel\n" +
      "2. Click the button for who won\n" +
      "3. Opponent confirms the result\n" +
      "4. Winner receives prize automatically\n\n" +
      "**Take screenshots** in case of disputes!",
    inline: false,
  });

  // Disconnects & Issues
  embed.addFields({
    name: "⚠️ DISCONNECTS & ISSUES",
    value:
      "• If someone disconnects before round 5, **restart the map**\n" +
      "• If disconnect after round 5, **continue from current score**\n" +
      "• For disputes, contact an admin with screenshots\n" +
      "• Intentional disconnects = forfeit",
    inline: false,
  });

  // Fair Play
  embed.addFields({
    name: "🚫 PROHIBITED",
    value:
      "```diff\n" +
      "- Cheating/hacking (permanent ban)\n" +
      "- Smurfing/account sharing\n" +
      "- Match fixing\n" +
      "- Toxic behavior\n" +
      "- Stalling/time wasting\n" +
      "- Using any weapon besides Vandal/Phantom\n" +
      "```",
    inline: false,
  });

  embed.setFooter({
    text: "By playing, you agree to these rules • Violations = forfeit + possible ban",
  });

  return embed;
}

/**
 * Ensure the rules panel exists in the channel
 */
async function ensureRulesPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(RULES_CHANNEL_ID);

    if (!channel) {
      console.error(`Rules channel ${RULES_CHANNEL_ID} not found`);
      return;
    }

    const embed = buildRulesEmbed();

    // Try to find existing panel
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("SKIRMISH RULES"),
    );

    if (existing) {
      await existing.edit({ embeds: [embed] });
      console.log("✅ Rules panel updated");
    } else {
      await channel.send({ embeds: [embed] });
      console.log("✅ Rules panel created");
    }
  } catch (err) {
    console.error("Failed to setup rules panel:", err);
  }
}

module.exports = {
  RULES_CHANNEL_ID,
  ensureRulesPanel,
  buildRulesEmbed,
};
