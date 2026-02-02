// components/analyticsPanel.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getAllAnalytics } = require("../services/analyticsService");

const ANALYTICS_CHANNEL_ID = "1467668822587609160";
const PANEL_TITLE = "SKIRMISH ANALYTICS";

/**
 * Format currency
 */
function formatCurrency(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * Format percentage
 */
function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Get trend indicator
 */
function getTrend(current, previous) {
  if (previous === 0) return current > 0 ? "📈" : "➖";
  const change = ((current - previous) / previous) * 100;
  if (change > 10) return "📈";
  if (change > 0) return "↗️";
  if (change < -10) return "📉";
  if (change < 0) return "↘️";
  return "➖";
}

/**
 * Build the main analytics embed
 */
async function buildAnalyticsEmbed(serverId) {
  const data = await getAllAnalytics(serverId);
  const { revenue, users, matches, payouts, financial } = data;

  const embed = new EmbedBuilder()
    .setTitle("📊 **SKIRMISH ANALYTICS DASHBOARD** 📊")
    .setDescription(
      "```\n" +
      "╔══════════════════════════════════════════╗\n" +
      "║     REAL-TIME PLATFORM METRICS           ║\n" +
      "╚══════════════════════════════════════════╝\n" +
      "```"
    )
    .setColor(0x5865f2) // Discord blurple
    .setTimestamp(new Date())
    .setFooter({ text: "Auto-refreshes every 2 minutes • Last updated" });

  // ══════════════════════════════════════════
  // REVENUE SECTION
  // ══════════════════════════════════════════
  const revenueText =
    "```\n" +
    "┌────────────────────────────────┐\n" +
    `│ ALL-TIME     │ ${formatCurrency(revenue.allTime.revenue).padStart(14)} │\n` +
    `│ This Month   │ ${formatCurrency(revenue.thisMonth.revenue).padStart(14)} │\n` +
    `│ This Week    │ ${formatCurrency(revenue.thisWeek.revenue).padStart(14)} │\n` +
    `│ Today        │ ${formatCurrency(revenue.today.revenue).padStart(14)} │\n` +
    "└────────────────────────────────┘\n" +
    "```" +
    `**Tickets Sold:** ${formatNumber(revenue.allTime.ticketsSold)} total\n` +
    `**Purchases:** ${revenue.allTime.purchases} transactions`;

  embed.addFields({
    name: "💰 **REVENUE**",
    value: revenueText,
    inline: false,
  });

  // ══════════════════════════════════════════
  // PROFIT SECTION
  // ══════════════════════════════════════════
  const profitText =
    "```diff\n" +
    `+ Gross Profit (Fees):  ${formatCurrency(financial.grossProfit)}\n` +
    `- Stripe Fees:          ${formatCurrency(financial.stripeFees)}\n` +
    "─────────────────────────────────\n" +
    `= Net Profit:           ${formatCurrency(financial.netProfit)}\n` +
    "```";

  embed.addFields({
    name: "📈 **PROFIT BREAKDOWN**",
    value: profitText,
    inline: false,
  });

  // ══════════════════════════════════════════
  // USERS SECTION
  // ══════════════════════════════════════════
  const usersText =
    `**Total Users:** ${formatNumber(users.totalUsers)}\n` +
    `**Active Players:** ${formatNumber(users.activeUsers)}\n` +
    `**Purchased This Week:** ${users.purchasingUsersThisWeek}\n` +
    `**Conversion Rate:** ${formatPercent(financial.conversionRate)}\n` +
    `**Avg Revenue/User:** ${formatCurrency(financial.avgRevenuePerUser)}`;

  embed.addFields({
    name: "👥 **USERS**",
    value: usersText,
    inline: true,
  });

  // ══════════════════════════════════════════
  // MATCHES SECTION
  // ══════════════════════════════════════════
  const matchesText =
    `**Total Matches:** ${formatNumber(matches.allTime.total)}\n` +
    `**Completed:** ${formatNumber(matches.allTime.completed)}\n` +
    `**This Week:** ${matches.thisWeek.total}\n` +
    `**Today:** ${matches.today.total}\n` +
    `**Active Now:** ${matches.activeNow} 🔴`;

  embed.addFields({
    name: "⚔️ **MATCHES**",
    value: matchesText,
    inline: true,
  });

  // ══════════════════════════════════════════
  // TIER BREAKDOWN
  // ══════════════════════════════════════════
  let tierText = "";
  if (matches.tierBreakdown && matches.tierBreakdown.length > 0) {
    for (const tier of matches.tierBreakdown) {
      const tierName = tier._id || "Unknown";
      const bar = "█".repeat(Math.min(10, Math.ceil(tier.count / 5))) + "░".repeat(Math.max(0, 10 - Math.ceil(tier.count / 5)));
      tierText += `\`${tierName.padEnd(5)}\` ${bar} ${tier.count}\n`;
    }
  } else {
    tierText = "No match data yet";
  }

  embed.addFields({
    name: "🎯 **TIER DISTRIBUTION**",
    value: tierText,
    inline: false,
  });

  // ══════════════════════════════════════════
  // PAYOUTS SECTION
  // ══════════════════════════════════════════
  const payoutsText =
    "```yaml\n" +
    `Pending Payouts:    ${payouts.pending.count} requests (${formatCurrency(payouts.pending.amount)})\n` +
    `Paid (All-Time):    ${payouts.completedAllTime.count} requests (${formatCurrency(payouts.completedAllTime.amount)})\n` +
    `Paid (This Month):  ${payouts.completedThisMonth.count} requests (${formatCurrency(payouts.completedThisMonth.amount)})\n` +
    "```";

  embed.addFields({
    name: "💸 **PAYOUTS**",
    value: payoutsText,
    inline: false,
  });

  // ══════════════════════════════════════════
  // FINANCIAL HEALTH
  // ══════════════════════════════════════════
  const healthStatus = financial.reserveRatio >= 1.5 ? "🟢 HEALTHY" :
                       financial.reserveRatio >= 1.0 ? "🟡 ADEQUATE" : "🔴 LOW";

  const healthText =
    `**Platform Liability:** ${formatCurrency(financial.liability)}\n` +
    `├ Pending Winnings: ${formatCurrency(users.pendingWinnings)}\n` +
    `└ Pending Payouts: ${formatCurrency(payouts.pending.amount)}\n\n` +
    `**Reserve Ratio:** ${financial.reserveRatio.toFixed(2)}x ${healthStatus}\n` +
    `**Prizes Paid Out:** ${formatCurrency(matches.totalPrizePaid)}`;

  embed.addFields({
    name: "🏦 **FINANCIAL HEALTH**",
    value: healthText,
    inline: false,
  });

  // ══════════════════════════════════════════
  // BUNDLE POPULARITY
  // ══════════════════════════════════════════
  let bundleText = "";
  if (revenue.bundleBreakdown && revenue.bundleBreakdown.length > 0) {
    const topBundles = revenue.bundleBreakdown.slice(0, 5);
    for (const bundle of topBundles) {
      const name = bundle._id ? bundle._id.replace(/_/g, " ") : "Unknown";
      bundleText += `• **${name}**: ${bundle.count} sold (${formatCurrency(bundle.revenue)})\n`;
    }
  } else {
    bundleText = "No purchases yet";
  }

  embed.addFields({
    name: "📦 **TOP BUNDLES**",
    value: bundleText,
    inline: false,
  });

  return embed;
}

/**
 * Build refresh button row
 */
function buildButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("analytics_refresh")
      .setLabel("Refresh Now")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("analytics_export")
      .setLabel("Export Report")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📄"),
    new ButtonBuilder()
      .setCustomId("analytics_reset")
      .setLabel("Reset Panel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
  );
}

/**
 * Ensure the analytics panel exists in the channel
 */
async function ensureAnalyticsPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(ANALYTICS_CHANNEL_ID);

    if (!channel) {
      console.error(`Analytics channel ${ANALYTICS_CHANNEL_ID} not found`);
      return;
    }

    const embed = await buildAnalyticsEmbed(guild.id);
    const row = buildButtonRow();

    // Try to find existing panel
    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("ANALYTICS")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
      console.log("✅ Analytics panel updated");
    } else {
      await channel.send({ embeds: [embed], components: [row] });
      console.log("✅ Analytics panel created");
    }
  } catch (err) {
    console.error("Failed to setup analytics panel:", err);
  }
}

/**
 * Refresh the analytics panel
 */
async function refreshAnalyticsPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(ANALYTICS_CHANNEL_ID);

    if (!channel) return;

    const embed = await buildAnalyticsEmbed(guild.id);
    const row = buildButtonRow();

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("ANALYTICS")
    );

    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    console.error("Failed to refresh analytics panel:", err);
  }
}

/**
 * Reset the analytics panel (delete and recreate)
 */
async function resetAnalyticsPanel(client) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(ANALYTICS_CHANNEL_ID);

    if (!channel) return;

    // Delete existing panel(s)
    const messages = await channel.messages.fetch({ limit: 20 });
    const existingPanels = messages.filter(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds?.[0]?.title?.includes("ANALYTICS")
    );

    for (const [, msg] of existingPanels) {
      await msg.delete().catch(() => {});
    }

    // Create fresh panel
    const embed = await buildAnalyticsEmbed(guild.id);
    const row = buildButtonRow();
    await channel.send({ embeds: [embed], components: [row] });

    console.log("✅ Analytics panel reset");
  } catch (err) {
    console.error("Failed to reset analytics panel:", err);
  }
}

/**
 * Handle button interactions
 */
async function handleAnalyticsButton(interaction, client) {
  if (interaction.customId === "analytics_refresh") {
    await interaction.deferUpdate();
    await refreshAnalyticsPanel(client);
  } else if (interaction.customId === "analytics_export") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const data = await getAllAnalytics(interaction.guild.id);
      const report = generateTextReport(data);

      await interaction.editReply({
        content: "```\n" + report + "\n```",
        ephemeral: true,
      });
    } catch (err) {
      await interaction.editReply({
        content: "Failed to generate report.",
        ephemeral: true,
      });
    }
  } else if (interaction.customId === "analytics_reset") {
    await interaction.deferReply({ ephemeral: true });
    await resetAnalyticsPanel(client);
    await interaction.editReply({
      content: "✅ Analytics panel has been reset.",
      ephemeral: true,
    });
  }
}

/**
 * Generate a text report for export
 */
function generateTextReport(data) {
  const { revenue, users, matches, payouts, financial } = data;

  const lines = [
    "═══════════════════════════════════════════",
    "        SKIRMISH ANALYTICS REPORT",
    `        Generated: ${new Date().toISOString()}`,
    "═══════════════════════════════════════════",
    "",
    "REVENUE",
    "───────────────────────────────────────────",
    `All-Time Revenue:     ${formatCurrency(revenue.allTime.revenue)}`,
    `This Month:           ${formatCurrency(revenue.thisMonth.revenue)}`,
    `This Week:            ${formatCurrency(revenue.thisWeek.revenue)}`,
    `Today:                ${formatCurrency(revenue.today.revenue)}`,
    `Total Tickets Sold:   ${revenue.allTime.ticketsSold}`,
    `Total Purchases:      ${revenue.allTime.purchases}`,
    "",
    "PROFIT",
    "───────────────────────────────────────────",
    `Gross Profit (Fees):  ${formatCurrency(financial.grossProfit)}`,
    `Stripe Fees:          ${formatCurrency(financial.stripeFees)}`,
    `Net Profit:           ${formatCurrency(financial.netProfit)}`,
    "",
    "USERS",
    "───────────────────────────────────────────",
    `Total Users:          ${users.totalUsers}`,
    `Active Players:       ${users.activeUsers}`,
    `Conversion Rate:      ${formatPercent(financial.conversionRate)}`,
    `Avg Revenue/User:     ${formatCurrency(financial.avgRevenuePerUser)}`,
    "",
    "MATCHES",
    "───────────────────────────────────────────",
    `Total Matches:        ${matches.allTime.total}`,
    `Completed:            ${matches.allTime.completed}`,
    `Active Now:           ${matches.activeNow}`,
    `Total Prize Paid:     ${formatCurrency(matches.totalPrizePaid)}`,
    "",
    "PAYOUTS",
    "───────────────────────────────────────────",
    `Pending:              ${payouts.pending.count} (${formatCurrency(payouts.pending.amount)})`,
    `Completed (All):      ${payouts.completedAllTime.count} (${formatCurrency(payouts.completedAllTime.amount)})`,
    "",
    "FINANCIAL HEALTH",
    "───────────────────────────────────────────",
    `Platform Liability:   ${formatCurrency(financial.liability)}`,
    `Reserve Ratio:        ${financial.reserveRatio.toFixed(2)}x`,
    "",
    "═══════════════════════════════════════════",
  ];

  return lines.join("\n");
}

module.exports = {
  ensureAnalyticsPanel,
  refreshAnalyticsPanel,
  resetAnalyticsPanel,
  handleAnalyticsButton,
  buildAnalyticsEmbed,
  ANALYTICS_CHANNEL_ID,
};
