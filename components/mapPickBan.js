const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

const MAPS = ["Skirmish A", "Skirmish B", "Skirmish C"];

/**
 * Create the initial map pick/ban embed and buttons
 */
function createMapPickBanEmbed(
  playerA,
  playerB,
  bannedMaps = [],
  currentBanner = null
) {
  const availableMaps = MAPS.filter((m) => !bannedMaps.includes(m));

  let description = "**Available Maps:**\n";
  availableMaps.forEach((map) => {
    description += `• ${map}\n`;
  });

  if (bannedMaps.length > 0) {
    description += "\n**Banned Maps:**\n";
    bannedMaps.forEach((map) => {
      description += `~~${map}~~\n`;
    });
  }

  if (currentBanner) {
    description += `\n🎯 <@${currentBanner}>'s turn to ban a map`;
  }

  const embed = new EmbedBuilder()
    .setTitle("🗺️ Map Pick/Ban Phase")
    .setDescription(description)
    .setColor(0x5865f2)
    .addFields(
      { name: "Player 1", value: `<@${playerA}>`, inline: true },
      { name: "Player 2", value: `<@${playerB}>`, inline: true }
    );

  return embed;
}

/**
 * Create map ban buttons
 */
function createMapBanButtons(bannedMaps = [], disabled = false) {
  const availableMaps = MAPS.filter((m) => !bannedMaps.includes(m));

  const buttons = availableMaps.map((map) =>
    new ButtonBuilder()
      .setCustomId(`BAN_MAP_${map.replace(/\s/g, "_")}`)
      .setLabel(`Ban ${map}`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  if (buttons.length === 0) return [];

  return [new ActionRowBuilder().addComponents(buttons)];
}

/**
 * Create the final map selection embed
 */
function createFinalMapEmbed(selectedMap, playerA, playerB) {
  return new EmbedBuilder()
    .setTitle("✅ Map Selected!")
    .setDescription(
      `The match will be played on **${selectedMap}**\n\n` +
        `Good luck to both players!`
    )
    .setColor(0x57f287)
    .addFields(
      { name: "Player 1", value: `<@${playerA}>`, inline: true },
      { name: "Player 2", value: `<@${playerB}>`, inline: true },
      { name: "Map", value: selectedMap, inline: true }
    );
}

module.exports = {
  MAPS,
  createMapPickBanEmbed,
  createMapBanButtons,
  createFinalMapEmbed,
};
