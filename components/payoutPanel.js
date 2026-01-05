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
const PayoutRequest = require("../models/PayoutRequest");

const PAYOUT_CHANNEL_ID = "1429134493750395051"; // Payout channel
const PAYOUT_LOG_CHANNEL_ID = "1427048537887346890"; // Create a private admin channel
const PANEL_TITLE = "💵 Cash Out Winnings";

function payoutButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("REQUEST_PAYOUT")
        .setLabel("💰 Request Cash Out")
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

function buildEmbed() {
  return new EmbedBuilder()
    .setTitle(PANEL_TITLE)
    .setDescription(
      "**💸 Convert Your Winnings to Real Money!**\n\n" +
        "Click the button below to request a cash out of your tournament winnings.\n\n" +
        "**How it works:**\n" +
        "1️⃣ Click the button and enter your payment details\n" +
        "2️⃣ Your request is logged and admins are notified\n" +
        "3️⃣ Payment is processed within 24-48 hours\n" +
        "4️⃣ You'll receive a DM confirmation when sent\n\n" +
        "**💳 Payment Methods:**\n" +
        "   • PayPal\n" +
        "   • Venmo\n" +
        "   • CashApp\n" +
        "   • Zelle\n\n" +
        "⏱️ **Processing Time:** Usually within 24-48 hours\n" +
        "💵 **Minimum Cashout:** $20.00"
    )
    .setColor(0x57f287)
    .setFooter({ text: "Win tournaments to earn cash prizes!" })
    .setTimestamp(new Date());
}

async function ensurePayoutPanel(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(PAYOUT_CHANNEL_ID);
  const embed = buildEmbed();
  const components = payoutButtons();

  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(
    (m) =>
      m.author.id === client.user.id && m.embeds?.[0]?.title === PANEL_TITLE
  );

  if (existing) {
    try {
      await existing.edit({ embeds: [embed], components });
      return;
    } catch (err) {
      console.warn("Failed to edit existing payout panel:", err);
    }
  }

  await channel.send({ embeds: [embed], components });
}

/** Show modal to collect payout info */
async function handlePayoutButton(interaction) {
  const serverId = interaction.guild.id;
  const userId = interaction.user.id;

  const profile = await Profile.findOne({ serverId, userId });
  const winnings = profile?.winningsBalance ?? 0;

  if (winnings < 20) {
    return interaction.reply({
      ephemeral: true,
      content:
        `💰 **Your Balance:**\n` +
        `• Winnings: **$${winnings.toFixed(2)}** 💵\n` +
        `• Tickets: **${profile?.balance ?? 0}** 🎟️\n\n` +
        `❌ Minimum cashout is $20.00. Keep playing to earn more!`,
    });
  }

  // Show modal to collect payment info
  const modal = new ModalBuilder()
    .setCustomId("PAYOUT_REQUEST_MODAL")
    .setTitle("Cash Out Request");

  const amountInput = new TextInputBuilder()
    .setCustomId("amount")
    .setLabel("Amount to withdraw (leave blank for all)")
    .setPlaceholder(`Max: $${winnings.toFixed(2)}`)
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const methodInput = new TextInputBuilder()
    .setCustomId("method")
    .setLabel("Payment Method")
    .setPlaceholder("PayPal, Venmo, CashApp, or Zelle")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const detailsInput = new TextInputBuilder()
    .setCustomId("details")
    .setLabel("Payment Details (email, username, etc.)")
    .setPlaceholder("e.g., user@email.com or @username")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(amountInput),
    new ActionRowBuilder().addComponents(methodInput),
    new ActionRowBuilder().addComponents(detailsInput)
  );

  return interaction.showModal(modal);
}

/** Handle payout request modal submission */
async function handlePayoutModal(interaction) {
  const serverId = interaction.guild.id;
  const userId = interaction.user.id;

  const profile = await Profile.findOne({ serverId, userId });
  const winnings = profile?.winningsBalance ?? 0;

  const amountStr = interaction.fields.getTextInputValue("amount");
  const method = interaction.fields.getTextInputValue("method");
  const details = interaction.fields.getTextInputValue("details");

  // Parse amount or use all
  const requestedAmount = amountStr
    ? parseFloat(amountStr.replace(/[$,]/g, ""))
    : winnings;

  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ Invalid amount. Please enter a valid number.",
    });
  }

  if (requestedAmount > winnings) {
    return interaction.reply({
      ephemeral: true,
      content: `❌ You only have $${winnings.toFixed(
        2
      )} available to withdraw.`,
    });
  }

  if (requestedAmount < 20) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ Minimum payout is $20.00.",
    });
  }

  // Create payout request in database
  const request = await PayoutRequest.create({
    userId,
    serverId,
    amount: requestedAmount,
    method,
    paymentDetails: details,
    status: "pending",
  });

  // Log to admin channel
  try {
    const guild = await interaction.client.guilds.fetch(serverId);
    const logChannel = await guild.channels.fetch(PAYOUT_LOG_CHANNEL_ID);

    const logEmbed = new EmbedBuilder()
      .setTitle("💰 New Payout Request")
      .setColor(0xfee75c)
      .addFields(
        { name: "User", value: `<@${userId}>`, inline: true },
        {
          name: "Amount",
          value: `$${requestedAmount.toFixed(2)}`,
          inline: true,
        },
        {
          name: "Available Balance",
          value: `$${winnings.toFixed(2)}`,
          inline: true,
        },
        { name: "Payment Method", value: method, inline: true },
        { name: "Payment Details", value: details, inline: true },
        { name: "Request ID", value: request.id, inline: true }
      )
      .setTimestamp();

    const adminButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`APPROVE_PAYOUT_${request.id}`)
        .setLabel("✅ Mark as Paid")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`REJECT_PAYOUT_${request.id}`)
        .setLabel("❌ Reject")
        .setStyle(ButtonStyle.Danger)
    );

    await logChannel.send({ embeds: [logEmbed], components: [adminButtons] });
  } catch (err) {
    console.error("Failed to log payout request:", err);
  }

  return interaction.reply({
    ephemeral: true,
    content:
      `✅ **Payout Request Submitted!**\n\n` +
      `• Amount: **$${requestedAmount.toFixed(2)}**\n` +
      `• Method: **${method}**\n` +
      `• Details: **${details}**\n\n` +
      `Your request has been sent to admins. You'll receive a DM when payment is processed. All payments will be processed within 24-48 hours of the made request.\n` +
      `Request ID: \`${request.id}\``,
  });
}

module.exports = {
  ensurePayoutPanel,
  handlePayoutButton,
  handlePayoutModal,
};
