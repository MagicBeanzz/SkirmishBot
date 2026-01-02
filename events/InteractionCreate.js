const profileSchema = require("../models/profileSchema");
const { join, leave, tierFromCustomId } = require("../services/queueService");
const { join2v2, leave2v2 } = require("../services/queue2v2Service");
const {
  refreshPanel,
  handleQueuePanelButton,
} = require("../Components/queuePanel");
const { refresh2v2Panel } = require("../Components/queue2v2Panel");
const {
  handlePayoutButton,
  handlePayoutModal,
} = require("../Components/payoutPanel");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const userId = interaction.user.id;
      const serverId = interaction.guild.id;

      // Ensure the user has a profile (auto-create)
      let profile = await profileSchema.findOne({ userId, serverId });
      if (!profile) {
        try {
          profile = await profileSchema.create({
            userId,
            serverId,
            balance: 10,
            winningsBalance: 0,
          });
        } catch (e) {
          // unique race tolerable
        }
      }

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, profile);
      } catch (e) {
        console.error(e);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(
            "Something went wrong executing this command."
          );
        } else {
          await interaction.reply({
            ephemeral: true,
            content: "Something went wrong.",
          });
        }
      }
      return;
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      // Handle payout request modal
      if (interaction.customId === "PAYOUT_REQUEST_MODAL") {
        await handlePayoutModal(interaction);
        return;
      }
      return;
    }

    // Component buttons
    if (interaction.isButton()) {
      const serverId = interaction.guild?.id; // Use optional chaining for DM safety
      const userId = interaction.user.id;

      // Handle team invite accept/decline (these come from DMs, so no guild)
      if (interaction.customId.startsWith("TEAM_ACCEPT_")) {
        const Team = require("../models/Team");
        const teamId = interaction.customId.replace("TEAM_ACCEPT_", "");

        const team = await Team.findById(teamId);
        if (!team || team.status !== "forming") {
          return interaction.update({
            content: "❌ This invite has expired or the team was disbanded.",
            embeds: [],
            components: [],
          });
        }

        if (team.partnerId) {
          return interaction.update({
            content: "❌ This team already has a partner.",
            embeds: [],
            components: [],
          });
        }

        // Check if user is already in a team (use serverId from team, not guild)
        const existing = await Team.findOne({
          serverId: team.serverId,
          $or: [
            { leaderId: interaction.user.id },
            { partnerId: interaction.user.id },
          ],
          status: { $in: ["forming", "ready"] },
        });

        if (existing) {
          return interaction.update({
            content: "❌ You're already in a team! Use `/team disband` first.",
            embeds: [],
            components: [],
          });
        }

        // Accept invite
        team.partnerId = interaction.user.id;
        team.status = "ready";
        await team.save();

        await interaction.update({
          content: `✅ You joined **${team.teamName}**! Use the 2v2 queue panel to enter tournaments.`,
          embeds: [],
          components: [],
        });

        // Notify team leader
        try {
          const leader = await interaction.client.users.fetch(team.leaderId);
          await leader.send(
            `✅ ${interaction.user} accepted your team invite! Your team **${team.teamName}** is now ready.`
          );
        } catch {}

        return;
      }

      if (interaction.customId.startsWith("TEAM_DECLINE_")) {
        const Team = require("../models/Team");
        const teamId = interaction.customId.replace("TEAM_DECLINE_", "");

        const team = await Team.findById(teamId);

        await interaction.update({
          content: "❌ You declined the team invite.",
          embeds: [],
          components: [],
        });

        // Notify team leader
        if (team) {
          try {
            const leader = await interaction.client.users.fetch(team.leaderId);
            await leader.send(
              `❌ ${interaction.user} declined your team invite for **${team.teamName}**.`
            );
          } catch {}
        }

        return;
      }

      // All other buttons require guild context
      if (!serverId) {
        return interaction.reply({
          ephemeral: true,
          content: "This button can only be used in the server, not in DMs.",
        });
      }

      // Handle map pick/ban buttons
      if (interaction.customId.startsWith("BAN_MAP_")) {
        const MapPickBan = require("../models/MapPickBan");
        const Match = require("../models/Match");
        const {
          MAPS,
          createMapPickBanEmbed,
          createMapBanButtons,
          createFinalMapEmbed,
        } = require("../components/mapPickBan");

        const matches = await Match.find({ channelId: interaction.channel.id });
        if (!matches.length) {
          return interaction.reply({
            ephemeral: true,
            content: "Could not find match data for this channel.",
          });
        }

        const pickBan = await MapPickBan.findOne({
          matchId: matches[0].id,
          completed: false,
        });

        if (!pickBan) {
          return interaction.reply({
            ephemeral: true,
            content: "Map selection has already been completed.",
          });
        }

        if (pickBan.currentBanner !== userId) {
          return interaction.reply({
            ephemeral: true,
            content: "It's not your turn to ban a map!",
          });
        }

        const mapName = interaction.customId
          .replace("BAN_MAP_", "")
          .replace(/_/g, " ");

        if (!MAPS.includes(mapName)) {
          return interaction.reply({
            ephemeral: true,
            content: "Invalid map selection.",
          });
        }

        if (pickBan.bannedMaps.includes(mapName)) {
          return interaction.reply({
            ephemeral: true,
            content: "This map has already been banned.",
          });
        }

        pickBan.bannedMaps.push(mapName);

        if (pickBan.bannedMaps.length === 2) {
          const remainingMap = MAPS.find(
            (m) => !pickBan.bannedMaps.includes(m)
          );
          pickBan.selectedMap = remainingMap;
          pickBan.completed = true;
          pickBan.currentBanner = null;
          await pickBan.save();

          const finalEmbed = createFinalMapEmbed(
            remainingMap,
            pickBan.playerA,
            pickBan.playerB
          );
          await interaction.update({
            embeds: [finalEmbed],
            components: [],
          });

          const {
            createReportButtons,
            createReportEmbed,
          } = require("../components/matchReport");
          const MatchReport = require("../models/MatchReport");

          const guild = interaction.guild;
          const memberA = await guild.members.fetch(pickBan.playerA);
          const memberB = await guild.members.fetch(pickBan.playerB);

          const reportEmbed = createReportEmbed(
            pickBan.playerA,
            pickBan.playerB,
            matches[0].id,
            remainingMap
          );
          const reportButtons = createReportButtons(
            matches[0].id,
            pickBan.playerA,
            pickBan.playerB,
            memberA.displayName,
            memberB.displayName
          );

          const reportMsg = await interaction.channel.send({
            content: "\n**🎮 Play your match now!**",
            embeds: [reportEmbed],
            components: reportButtons,
          });

          await MatchReport.create({
            matchId: matches[0].id,
            reportMessageId: reportMsg.id,
          });
        } else {
          const currentIndex = pickBan.banOrder.indexOf(pickBan.currentBanner);
          const nextIndex = (currentIndex + 1) % pickBan.banOrder.length;
          pickBan.currentBanner = pickBan.banOrder[nextIndex];
          await pickBan.save();

          const embed = createMapPickBanEmbed(
            pickBan.playerA,
            pickBan.playerB,
            pickBan.bannedMaps,
            pickBan.currentBanner
          );
          const buttons = createMapBanButtons(pickBan.bannedMaps, false);

          await interaction.update({
            embeds: [embed],
            components: buttons,
          });
        }
        return;
      }

      // Handle match result reporting
      if (interaction.customId.startsWith("REPORT_WIN_")) {
        const Match = require("../models/Match");
        const MatchReport = require("../models/MatchReport");
        const {
          createConfirmationEmbed,
          createDisputeButtons,
        } = require("../components/matchReport");

        const parts = interaction.customId.split("_");
        const matchId = parts[2];
        const reportedWinnerId = parts[3];

        const match = await Match.findById(matchId);
        if (!match) {
          return interaction.reply({
            ephemeral: true,
            content: "Match not found.",
          });
        }

        if (![match.playerA, match.playerB].includes(userId)) {
          return interaction.reply({
            ephemeral: true,
            content: "You are not a participant in this match.",
          });
        }

        if (match.winnerId) {
          return interaction.reply({
            ephemeral: true,
            content: "This match has already been reported.",
          });
        }

        let report = await MatchReport.findOne({ matchId });
        if (!report) {
          report = await MatchReport.create({ matchId });
        }

        if (
          report.reportedWinnerId &&
          report.reportedBy &&
          report.reportedBy !== userId
        ) {
          return interaction.reply({
            ephemeral: true,
            content:
              "A result has already been reported. Please use the confirm/dispute buttons.",
          });
        }

        if (report.reportedWinnerId && report.reportedBy === userId) {
          return interaction.reply({
            ephemeral: true,
            content:
              "You already reported this result. Wait for your opponent to confirm or dispute.",
          });
        }

        report.reportedWinnerId = reportedWinnerId;
        report.reportedBy = userId;
        await report.save();

        const opponentId =
          match.playerA === userId ? match.playerB : match.playerA;

        const confirmEmbed = createConfirmationEmbed(
          reportedWinnerId,
          opponentId,
          userId
        );
        const disputeButtons = createDisputeButtons(matchId, reportedWinnerId);

        await interaction.update({
          embeds: [confirmEmbed],
          components: disputeButtons,
        });

        return;
      }

      // Handle match result confirmation
      if (interaction.customId.startsWith("CONFIRM_WIN_")) {
        const Match = require("../models/Match");
        const Tournament = require("../models/Tournament");
        const MatchReport = require("../models/MatchReport");
        const { createFinalResultEmbed } = require("../components/matchReport");
        const { upsertBracketMessage } = require("../services/bracketService");
        const { recordMatchResult } = require("../services/statsService");
        const {
          refreshLeaderboard,
        } = require("../components/leaderboardPanel");

        const parts = interaction.customId.split("_");
        const matchId = parts[2];
        const winnerId = parts[3];

        const match = await Match.findById(matchId);
        if (!match) {
          return interaction.reply({
            ephemeral: true,
            content: "Match not found.",
          });
        }

        const report = await MatchReport.findOne({ matchId });
        if (!report || !report.reportedWinnerId) {
          return interaction.reply({
            ephemeral: true,
            content: "No report to confirm.",
          });
        }

        if (userId === report.reportedBy) {
          return interaction.reply({
            ephemeral: true,
            content:
              "You cannot confirm your own report. Wait for your opponent to confirm.",
          });
        }

        if (![match.playerA, match.playerB].includes(userId)) {
          return interaction.reply({
            ephemeral: true,
            content: "Only participants in this match can confirm the result.",
          });
        }

        const loserId =
          winnerId === match.playerA ? match.playerB : match.playerA;

        report.confirmed = true;
        await report.save();

        match.winnerId = winnerId;
        match.state = "COMPLETE";
        await match.save();

        await recordMatchResult(match.serverId, winnerId, loserId);

        const finalEmbed = createFinalResultEmbed(winnerId, loserId);
        await interaction.update({
          embeds: [finalEmbed],
          components: [],
        });

        // Get tournament to determine game mode
        const tournament = await Tournament.findById(match.tournamentId);

        // Route to correct service based on game mode
        console.log(`Tournament game mode: ${tournament?.gameMode}`);
        if (tournament && tournament.gameMode === "2v2") {
          // Use 2v2 service
          const {
            considerAdvanceOrFinish: considerAdvanceOrFinish2v2,
            closeMatchChannel: closeMatchChannel2v2,
          } = require("../services/tournament2v2Service");

          await upsertBracketMessage(interaction.client, match.tournamentId);
          await closeMatchChannel2v2(interaction.client, match, winnerId);
          await considerAdvanceOrFinish2v2(
            interaction.client,
            match.tournamentId
          );
        } else {
          // Use 1v1 service
          const {
            considerAdvanceOrFinish,
            closeMatchChannel,
          } = require("../services/tournamentService");

          await upsertBracketMessage(interaction.client, match.tournamentId);
          await closeMatchChannel(interaction.client, match, winnerId);
          await considerAdvanceOrFinish(interaction.client, match.tournamentId);
        }

        await refreshLeaderboard(interaction.client);

        return;
      }

      // Handle match disputes
      if (interaction.customId.startsWith("DISPUTE_WIN_")) {
        const MatchReport = require("../models/MatchReport");

        const parts = interaction.customId.split("_");
        const matchId = parts[2];

        const report = await MatchReport.findOne({ matchId });
        if (!report) {
          return interaction.reply({
            ephemeral: true,
            content: "No report found to dispute.",
          });
        }

        report.disputed = true;
        await report.save();

        await interaction.update({
          embeds: [
            {
              title: "⚠️ Result Disputed",
              description:
                `<@${userId}> has disputed the match result.\n\n` +
                `An admin will review this match. Please wait for resolution.`,
              color: 0xed4245,
            },
          ],
          components: [],
        });

        return;
      }

      // Handle ticket purchases
      if (interaction.customId.startsWith("BUY_TICKETS_")) {
        const {
          createTicketCheckoutSession,
        } = require("../services/stripeService");

        const bundleId = interaction.customId.replace("BUY_TICKETS_", "");

        try {
          await interaction.deferReply({ ephemeral: true });

          const session = await createTicketCheckoutSession(
            userId,
            bundleId,
            serverId
          );

          const { getBundleById } = require("../config/ticketBundles");
          const bundle = getBundleById(bundleId);

          return interaction.editReply({
            content:
              `🎫 **Purchase ${bundle.label}**\n\n` +
              `Click the link below to complete your purchase:\n` +
              `${session.url}\n\n` +
              `✅ Secure checkout powered by Stripe\n` +
              `✅ Tickets credited automatically after payment\n` +
              `✅ Link expires in 24 hours`,
          });
        } catch (err) {
          console.error("Error creating checkout session:", err);
          return interaction.editReply({
            content:
              "❌ Failed to create checkout session. Please try again or contact an admin.",
          });
        }
      }

      // Admin payout approve button
      if (interaction.customId.startsWith("APPROVE_PAYOUT_")) {
        const PayoutRequest = require("../models/PayoutRequest");
        const Profile = require("../models/profileSchema");

        const requestId = interaction.customId.replace("APPROVE_PAYOUT_", "");
        const request = await PayoutRequest.findById(requestId);

        if (!request) {
          return interaction.reply({
            ephemeral: true,
            content: "❌ Request not found.",
          });
        }

        if (request.status !== "pending") {
          return interaction.reply({
            ephemeral: true,
            content: `❌ This request is already ${request.status}.`,
          });
        }

        const profile = await Profile.findOne({
          serverId: request.serverId,
          userId: request.userId,
        });

        if (!profile || profile.winningsBalance < request.amount) {
          return interaction.reply({
            ephemeral: true,
            content: "❌ Insufficient balance for this payout.",
          });
        }

        profile.winningsBalance -= request.amount;
        await profile.save();

        request.status = "completed";
        request.processedBy = userId;
        request.processedAt = new Date();
        await request.save();

        await interaction.update({
          content: `✅ **PAID** by <@${userId}>`,
          components: [],
        });

        try {
          const user = await interaction.client.users.fetch(request.userId);
          await user.send(
            `✅ Your payout of **$${request.amount.toFixed(
              2
            )}** has been sent via ${request.method}!`
          );
        } catch {}

        return;
      }

      // Admin payout reject button
      if (interaction.customId.startsWith("REJECT_PAYOUT_")) {
        const PayoutRequest = require("../models/PayoutRequest");

        const requestId = interaction.customId.replace("REJECT_PAYOUT_", "");
        const request = await PayoutRequest.findById(requestId);

        if (!request) {
          return interaction.reply({
            ephemeral: true,
            content: "❌ Request not found.",
          });
        }

        if (request.status !== "pending") {
          return interaction.reply({
            ephemeral: true,
            content: `❌ This request is already ${request.status}.`,
          });
        }

        request.status = "rejected";
        request.processedBy = userId;
        request.processedAt = new Date();
        request.notes = "Rejected by admin";
        await request.save();

        await interaction.update({
          content: `❌ **REJECTED** by <@${userId}>`,
          components: [],
        });

        try {
          const user = await interaction.client.users.fetch(request.userId);
          await user.send(
            `❌ Your payout request of **$${request.amount.toFixed(
              2
            )}** was rejected. Contact an admin for details.`
          );
        } catch {}

        return;
      }

      // 1v1 Queue panel buttons
      const handled = await handleQueuePanelButton(interaction);
      if (handled) return;

      // 2v2 Queue buttons - JOIN_2V2_T*
      if (interaction.customId.startsWith("JOIN_2V2_")) {
        const tierKey = interaction.customId.replace("JOIN_2V2_", "");
        await interaction.deferReply({ ephemeral: true });
        const res = await join2v2(serverId, userId, tierKey);
        await refresh2v2Panel(interaction.client);
        return interaction.editReply(res.msg);
      }

      if (interaction.customId === "LEAVE_2V2_QUEUE") {
        await interaction.deferReply({ ephemeral: true });
        const res = await leave2v2(serverId, userId);
        await refresh2v2Panel(interaction.client);
        return interaction.editReply(res.msg);
      }

      if (interaction.customId === "REFRESH_2V2_PANEL") {
        await interaction.deferReply({ ephemeral: true });
        await refresh2v2Panel(interaction.client);
        return interaction.editReply("2v2 panel refreshed.");
      }

      // 1v1 Queue buttons
      const tierKey = tierFromCustomId(interaction.customId);
      if (tierKey) {
        await interaction.deferReply({ ephemeral: true });
        const res = await join(serverId, userId, tierKey);
        await refreshPanel(interaction.client);
        return interaction.editReply(res.msg);
      }

      if (interaction.customId === "LEAVE_QUEUE") {
        await interaction.deferReply({ ephemeral: true });
        const res = await leave(serverId, userId);
        await refreshPanel(interaction.client);
        return interaction.editReply(res.msg);
      }

      if (interaction.customId === "REFRESH_PANEL") {
        await interaction.deferReply({ ephemeral: true });
        await refreshPanel(interaction.client);
        return interaction.editReply("Panel refreshed.");
      }

      // Payout button
      if (interaction.customId === "REQUEST_PAYOUT") {
        return handlePayoutButton(interaction);
      }
    }
  },
};
