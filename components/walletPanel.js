const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const Profile = require("../models/profileSchema");

// Use the provided channel ID by default; allow override via env if you want.
const WALLET_CHANNEL_ID =
  process.env.WALLET_CHANNEL_ID || "1427041016808210442";

const PANEL_TITLE = "💼 Wallet & Payouts";

// Button custom IDs
const BTN_STRIPE_CASHOUT = "WALLET_CASHOUT_STRIPE";
const BTN_CONVERT_TIX = "WALLET_CONVERT_TICKETS";

// Modal + field IDs
const MODAL_CONVERT_ID = "WALLET_CONVERT_MODAL";
const FIELD_TICKETS_AMOUNT = "TICKETS_AMOUNT";

/** Two-button row: 1) Stripe cashout (stub)  2) Convert winnings → tickets */
function walletButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(BTN_STRIPE_CASHOUT)
        .setLabel("Cash Out via Stripe")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(BTN_CONVERT_TIX)
        .setLabel("Convert Winnings → Tickets")
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

function buildEmbed() {
  return new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      [
        "• **Cash Out via Stripe** — starts an external payout process (coming soon).",
        "• **Convert Winnings → Tickets** — choose how many tickets to mint using your winnings (1:1).",
        "",
        "_Tickets are used to enter tournaments. Winnings are in USD._",
      ].join("\n")
    )
    .setTimestamp(new Date());
}

/**
 * Ensure a single Wallet panel exists:
 *  - Fetch recent messages from the wallet channel
 *  - If a bot-sent message with matching title exists, edit it
 *  - Otherwise send a new one
 */
async function ensureWalletPanel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(WALLET_CHANNEL_ID);
  const embed = buildEmbed();
  const components = walletButtons();

  // Look back a bit to find an existing panel to edit
  const messages = await channel.messages.fetch({ limit: 15 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id && m.embeds?.[0]?.title === PANEL_TITLE
  );

  if (existing) {
    try {
      await existing.edit({ embeds: [embed], components });
      return;
    } catch (err) {
      console.warn("Wallet panel edit failed; sending a new one.", err);
    }
  }

  await channel.send({ embeds: [embed], components });
}

/** Handle button presses in the wallet panel */
async function handleWalletButton(interaction) {
  if (interaction.customId === BTN_STRIPE_CASHOUT) {
    // Stub only — no external processor wired yet.
    return interaction.reply({
      ephemeral: true,
      content:
        "🧾 Stripe cash out is coming soon. For now, use the payout request flow once it’s enabled.",
    });
  }

  if (interaction.customId === BTN_CONVERT_TIX) {
    // Show a modal to collect how many tickets the user wants
    const modal = new ModalBuilder()
      .setCustomId(MODAL_CONVERT_ID)
      .setTitle("Convert Winnings → Tickets");

    const ticketsInput = new TextInputBuilder()
      .setCustomId(FIELD_TICKETS_AMOUNT)
      .setLabel("How many tickets do you want?")
      .setPlaceholder("Enter a whole number, e.g. 5")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(ticketsInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }
}

/** Handle the modal submit for converting winnings to tickets */
async function handleWalletModal(interaction) {
  if (interaction.customId !== MODAL_CONVERT_ID) return;

  const raw = interaction.fields.getTextInputValue(FIELD_TICKETS_AMOUNT) ?? "";
  const requested = Number.parseInt(raw.replace(/[, ]+/g, ""), 10);

  if (!Number.isFinite(requested) || requested < 1) {
    return interaction.reply({
      ephemeral: true,
      content: "Please enter a valid whole number ≥ 1.",
    });
  }

  const serverId = interaction.guild.id;
  const userId = interaction.user.id;

  // Ensure profile
  let profile = await Profile.findOne({ serverId, userId });
  if (!profile) {
    profile = await Profile.create({
      serverId,
      userId,
      balance: 10,
      winningsBalance: 0,
    });
  }

  // Only whole dollars can convert 1:1 to tickets
  const availableWholeDollars = Math.max(
    0,
    Math.floor(profile.winningsBalance ?? 0)
  );

  if (availableWholeDollars < requested) {
    return interaction.reply({
      ephemeral: true,
      content: `You requested **${requested}** tickets, but you only have **$${availableWholeDollars}** in whole-dollar winnings available to convert.`,
    });
  }

  // Apply conversion
  profile.winningsBalance = (profile.winningsBalance ?? 0) - requested;
  profile.balance = (profile.balance ?? 0) + requested;
  await profile.save();

  return interaction.reply({
    ephemeral: true,
    content:
      `✅ Converted **$${requested} → ${requested} tickets**.\n` +
      `New balances: **${
        profile.balance
      }** tickets • **$${profile.winningsBalance.toFixed(
        2
      )}** winnings remaining.`,
  });
}

module.exports = {
  ensureWalletPanel,
  handleWalletButton,
  handleWalletModal,
};
