const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const MATCHMAKING_CHANNEL_ID = "1457148385533362428"; // Panel goes in matchmaking channel
const PANEL_TITLE = "⚔️ Challenge a Friend";

/**
 * Build the challenge panel embed
 */
function buildChallengePanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "Want to compete against a specific player? Click the button below to send them a challenge!\n\n" +
        "**How it works:**\n" +
        "1️⃣ Click 'Challenge Someone'\n" +
        "2️⃣ Enter your opponent's username or ID\n" +
        "3️⃣ Select a tier\n" +
        "4️⃣ They'll receive a notification in <#1457517486558941204>\n" +
        "5️⃣ They have 5 minutes to accept\n" +
        "6️⃣ Battle it out for the prize!"
    )
    .setColor(0xffa500)
    .setTimestamp(new Date());

  return embed;
}

/**
 * Build challenge button
 */
function buildChallengeButton() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("CHALLENGE_CREATE")
      .setLabel("⚔️ Challenge Someone")
      .setStyle(ButtonStyle.Success)
  );

  return [row];
}

/**
 * Build the full challenge panel
 */
function buildChallengePanel() {
  const embed = buildChallengePanelEmbed();
  const components = buildChallengeButton();

  return { embeds: [embed], components };
}

/**
 * Ensure the challenge panel exists in the matchmaking channel
 */
async function ensureChallengePanel(client) {
  try {
    const channel = await client.channels.fetch(MATCHMAKING_CHANNEL_ID);

    if (!channel) {
      console.error("❌ Matchmaking channel not found!");
      return;
    }

    // Search for existing challenge panel
    try {
      const messages = await channel.messages.fetch({ limit: 20 });
      const existingPanel = messages.find(
        (msg) =>
          msg.author.id === client.user.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title === PANEL_TITLE
      );

      if (existingPanel) {
        // Update existing panel
        const panelData = buildChallengePanel();
        await existingPanel.edit(panelData);
        console.log(`✅ Challenge panel updated: ${existingPanel.id}`);
        return;
      }
    } catch (err) {
      console.log("Could not fetch existing messages, creating new challenge panel...");
    }

    // Create new panel if no existing one found
    const panelData = buildChallengePanel();
    const message = await channel.send(panelData);
    console.log(`✅ Challenge panel created: ${message.id}`);
  } catch (err) {
    console.error("❌ Error ensuring challenge panel:", err);
  }
}

module.exports = {
  ensureChallengePanel,
  buildChallengePanel,
};
