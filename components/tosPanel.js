const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const TOS_CHANNEL_ID = "1456874575806726225"; // Replace with actual channel ID
const TOS_ACCEPTED_ROLE_NAME = "ToS Accepted"; // Role to give upon acceptance
let tosMessageId = null;

/**
 * Build the ToS acceptance embed
 */
function buildToSEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("📜 SkirmishBot Terms of Service")
    .setDescription(
      "**Welcome to SkirmishBot!**\n\n" +
        "Before you can participate in tournaments and access our services, you must read and accept our Terms of Service.\n\n" +
        "**By clicking Accept below, you agree to:**\n" +
        "✅ You are at least **18 years of age**\n" +
        "✅ You have verified participation is **legal in your jurisdiction**\n" +
        "✅ You understand all **ticket sales are final** (no refunds)\n" +
        "✅ You are **solely responsible** for all applicable taxes\n" +
        "✅ You agree to **binding arbitration** for disputes\n" +
        "✅ You waive your right to **class action lawsuits**\n" +
        "✅ You accept the service **AS IS** without warranties\n\n" +
        "**IMPORTANT:** Residents of AZ, HI, IA, MS, MT, NV, and SD are **PROHIBITED** from cash prize tournaments.\n\n" +
        "**Please read the full Terms of Service carefully:**\n" +
        "[View Full Terms of Service](https://github.com/MagicBeanzz/Valorant-Skirmish-Underground-ToS/blob/main/TERMS_OF_SERVICE.md)"
    )
    .setColor(0x5865f2)
    .setFooter({
      text: "You must accept the ToS to access tournament services",
    })
    .setTimestamp();

  return embed;
}

/**
 * Build accept button
 */
function buildAcceptButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("accept_tos")
      .setLabel("✅ I Accept the Terms of Service")
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Post or update the ToS acceptance panel
 */
async function upsertToSPanel(client) {
  try {
    const channel = await client.channels.fetch(TOS_CHANNEL_ID);
    if (!channel) {
      console.error("ToS channel not found!");
      return;
    }

    const embed = buildToSEmbed();
    const button = buildAcceptButton();

    // Search for existing ToS panel message from the bot
    try {
      const messages = await channel.messages.fetch({ limit: 10 });
      const existingPanel = messages.find(
        (msg) =>
          msg.author.id === client.user.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title === "📜 SkirmishBot Terms of Service"
      );

      if (existingPanel) {
        // Update existing message
        await existingPanel.edit({ embeds: [embed], components: [button] });
        tosMessageId = existingPanel.id;
        console.log(`✅ ToS panel updated: ${existingPanel.id}`);
        return;
      }
    } catch (err) {
      console.log("Could not fetch existing messages, creating new panel...");
    }

    // Create new panel if no existing one found
    const message = await channel.send({
      embeds: [embed],
      components: [button],
    });
    tosMessageId = message.id;
    console.log(`✅ ToS panel created: ${message.id}`);
  } catch (err) {
    console.error("Error upserting ToS panel:", err);
  }
}

/**
 * Handle ToS acceptance
 */
async function handleToSAcceptance(interaction) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;

    // Find or create "ToS Accepted" role
    let tosRole = guild.roles.cache.find(
      (r) => r.name === TOS_ACCEPTED_ROLE_NAME
    );

    if (!tosRole) {
      // Create the role if it doesn't exist
      tosRole = await guild.roles.create({
        name: TOS_ACCEPTED_ROLE_NAME,
        color: 0x57f287, // Green
        reason: "ToS acceptance role",
      });
      console.log(`✅ Created ToS Accepted role: ${tosRole.id}`);
    }

    // Check if user already has the role
    if (member.roles.cache.has(tosRole.id)) {
      return interaction.reply({
        content: "✅ You have already accepted the Terms of Service!",
        ephemeral: true,
      });
    }

    // Give the role
    await member.roles.add(tosRole);

    // Log acceptance in database
    const ToSAcceptance = require("../models/ToSAcceptance");
    await ToSAcceptance.create({
      userId: interaction.user.id,
      serverId: guild.id,
      acceptedAt: new Date(),
      ipAddress: null, // Discord doesn't provide IP
      version: "1.0", // Version of ToS they accepted
    });

    return interaction.reply({
      content:
        "✅ **Terms of Service Accepted!**\n\n" +
        "You now have access to all SkirmishBot services.\n" +
        "Your acceptance has been logged.\n\n" +
        "Welcome to SkirmishBot! 🎮",
      ephemeral: true,
    });
  } catch (err) {
    console.error("Error handling ToS acceptance:", err);
    return interaction.reply({
      content: "❌ Something went wrong. Please contact an admin.",
      ephemeral: true,
    });
  }
}

module.exports = {
  TOS_CHANNEL_ID,
  TOS_ACCEPTED_ROLE_NAME,
  upsertToSPanel,
  buildToSEmbed,
  buildAcceptButton,
  handleToSAcceptance,
};
