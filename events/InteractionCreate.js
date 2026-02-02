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
const {
  joinMatchmaking,
  leaveMatchmaking,
  handleMapSelection,
  reportMatchResult,
  confirmMatchResult,
  disputeMatchResult,
} = require("../services/matchmakingService");
const { refreshMatchmakingPanel } = require("../components/matchmakingPanel");

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

      // Handle prize redemption shipping modal
      if (interaction.customId.startsWith("SHIPPING_MODAL_")) {
        const { redeemPrize } = require("../services/prizeService");
        const prizeId = interaction.customId.replace("SHIPPING_MODAL_", "");

        const shippingInfo = {
          fullName: interaction.fields.getTextInputValue("fullName"),
          addressLine1: interaction.fields.getTextInputValue("addressLine1"),
          addressLine2:
            interaction.fields.getTextInputValue("addressLine2") || null,
          city: interaction.fields.getTextInputValue("city"),
          state: interaction.fields.getTextInputValue("state"),
          zipCode: interaction.fields.getTextInputValue("zipCode"),
          country: "USA",
          phone: interaction.fields.getTextInputValue("phone") || null,
        };

        const result = await redeemPrize(
          interaction.user.id,
          interaction.guild.id,
          prizeId,
          shippingInfo
        );

        await interaction.reply({
          content: result.msg,
          ephemeral: true,
        });

        return;
      }

      // Handle challenge creation modal
      if (interaction.customId === "CHALLENGE_MODAL") {
        try {
          await interaction.deferReply({ flags: 64 }); // 64 = ephemeral

          const opponentInput = interaction.fields.getTextInputValue("opponent").trim();
          const tierInput = interaction.fields.getTextInputValue("tier").trim().toUpperCase();

          // Try to find the opponent user
          let opponentId = null;

          // Check if it's a user ID (numeric)
          if (/^\d+$/.test(opponentInput)) {
            opponentId = opponentInput;
          } else {
            // Try to find by username - search by query instead of fetching all
            try {
              const members = await interaction.guild.members.fetch({
                query: opponentInput,
                limit: 10,
              });

              // Try exact match first
              const found = members.find(
                (m) =>
                  m.user.username.toLowerCase() === opponentInput.toLowerCase() ||
                  m.displayName.toLowerCase() === opponentInput.toLowerCase()
              );

              if (found) {
                opponentId = found.user.id;
              } else if (members.size > 0) {
                // If no exact match, use first result
                opponentId = members.first().user.id;
              }
            } catch (err) {
              console.error("Error finding opponent:", err);
            }
          }

          if (!opponentId) {
            return interaction.editReply(
              "❌ Could not find that user. Try using their user ID instead (right-click → Copy User ID)."
            );
          }

          // Validate tier
          const MATCHMAKING_TIERS = require("../config/matchmakingTiers");
          const tier = MATCHMAKING_TIERS.find((t) => t.key === tierInput);
          if (!tier) {
            return interaction.editReply(
              `❌ Invalid tier. Valid tiers are: ${MATCHMAKING_TIERS.map((t) => t.key).join(", ")}`
            );
          }

          // Create the challenge
          const { createChallenge } = require("../services/challengeService");
          const result = await createChallenge(
            interaction.client,
            interaction.guild.id,
            interaction.user.id,
            opponentId,
            tierInput
          );

          return interaction.editReply(result.message);
        } catch (err) {
          console.error("Error handling challenge modal:", err);
          return interaction.editReply("❌ An error occurred while creating the challenge. Please try again.");
        }
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
        const { TOS_ACCEPTED_ROLE_NAME } = require("../components/tosPanel");

        const bundleId = interaction.customId.replace("BUY_TICKETS_", "");

        try {
          await interaction.deferReply({ ephemeral: true });

          // LEGAL REQUIREMENT: Check ToS acceptance before allowing purchase
          const tosRole = interaction.guild.roles.cache.find(
            (r) => r.name === TOS_ACCEPTED_ROLE_NAME
          );

          if (!tosRole || !interaction.member.roles.cache.has(tosRole.id)) {
            return interaction.editReply({
              content:
                "❌ **Terms of Service Required**\n\n" +
                "You must accept the Terms of Service before purchasing tickets.\n" +
                "Please visit the ToS channel and click 'Accept' to continue.\n\n" +
                "This is required for legal compliance.",
            });
          }

          // NOTE: Geofencing is handled via Stripe's IP collection
          // Discord doesn't provide user IP addresses directly
          // Stripe collects IP during checkout and we validate in webhook

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

      // Matchmaking buttons
      if (interaction.customId.startsWith("MM_JOIN_")) {
        await interaction.deferReply({ ephemeral: true });
        const tierKey = interaction.customId.replace("MM_JOIN_", "");
        const result = await joinMatchmaking(
          interaction.client,
          serverId,
          userId,
          tierKey
        );
        await refreshMatchmakingPanel(interaction.client);
        return interaction.editReply(result.message);
      }

      if (interaction.customId === "MM_LEAVE_QUEUE") {
        await interaction.deferReply({ ephemeral: true });
        const result = await leaveMatchmaking(serverId, userId);
        await refreshMatchmakingPanel(interaction.client);
        return interaction.editReply(result.message);
      }

      if (interaction.customId === "MM_REFRESH_PANEL") {
        await interaction.deferReply({ ephemeral: true });
        await refreshMatchmakingPanel(interaction.client);
        return interaction.editReply("✅ Matchmaking panel refreshed.");
      }

      // Matchmaking map selection
      if (interaction.customId.startsWith("MM_MAP_")) {
        const mapName = interaction.customId
          .replace("MM_MAP_", "")
          .split("_")
          .slice(1)
          .join("_")
          .replace(/_/g, " ");

        const parts = interaction.customId.split("_");
        const matchId = parts[2];

        const result = await handleMapSelection(
          interaction.client,
          matchId,
          mapName,
          userId,
          interaction
        );

        // Only reply ephemerally if there was an error (interaction.update already called on success)
        if (!result.success) {
          return interaction.reply({
            ephemeral: true,
            content: result.message,
          });
        }
        return;
      }

      // Matchmaking match reporting
      if (interaction.customId.startsWith("MM_REPORT_WIN_")) {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split("_");
        const matchId = parts[3];
        const winnerId = parts[4];

        const result = await reportMatchResult(
          interaction.client,
          matchId,
          winnerId,
          userId,
          interaction
        );
        return interaction.editReply(result.message);
      }

      // Matchmaking match confirmation
      if (interaction.customId.startsWith("MM_CONFIRM_WIN_")) {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split("_");
        const matchId = parts[3];
        const winnerId = parts[4];

        const result = await confirmMatchResult(
          interaction.client,
          matchId,
          winnerId,
          userId
        );

        // Update the message to show completion
        if (result.success) {
          await interaction.message.edit({
            components: [],
          });
        }

        return interaction.editReply(result.message);
      }

      // Matchmaking match dispute
      if (interaction.customId.startsWith("MM_DISPUTE_WIN_")) {
        const parts = interaction.customId.split("_");
        const matchId = parts[3];

        const result = await disputeMatchResult(
          interaction.client,
          matchId,
          userId
        );

        if (!result.success) {
          return interaction.reply({
            ephemeral: true,
            content: result.message,
          });
        }

        // Update the message to show dispute status
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

      // Challenge system - Create challenge button
      if (interaction.customId === "CHALLENGE_CREATE") {
        const {
          ModalBuilder,
          TextInputBuilder,
          TextInputStyle,
          ActionRowBuilder,
        } = require("discord.js");

        const modal = new ModalBuilder()
          .setCustomId("CHALLENGE_MODAL")
          .setTitle("Challenge a Player");

        const opponentInput = new TextInputBuilder()
          .setCustomId("opponent")
          .setLabel("Opponent Username or ID")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter username or user ID")
          .setRequired(true)
          .setMaxLength(100);

        const tierInput = new TextInputBuilder()
          .setCustomId("tier")
          .setLabel("Tier (MM5, MM10, MM20, or MM50)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Example: MM10")
          .setRequired(true)
          .setMaxLength(10);

        modal.addComponents(
          new ActionRowBuilder().addComponents(opponentInput),
          new ActionRowBuilder().addComponents(tierInput)
        );

        return interaction.showModal(modal);
      }

      // Challenge system - Accept challenge
      if (interaction.customId.startsWith("CHALLENGE_ACCEPT_")) {
        await interaction.deferReply({ ephemeral: true });
        const challengeId = interaction.customId.replace("CHALLENGE_ACCEPT_", "");

        const { acceptChallenge } = require("../services/challengeService");
        const result = await acceptChallenge(
          interaction.client,
          challengeId,
          userId
        );

        return interaction.editReply(result.message);
      }

      // Challenge system - Decline challenge
      if (interaction.customId.startsWith("CHALLENGE_DECLINE_")) {
        await interaction.deferReply({ ephemeral: true });
        const challengeId = interaction.customId.replace("CHALLENGE_DECLINE_", "");

        const { declineChallenge } = require("../services/challengeService");
        const result = await declineChallenge(
          interaction.client,
          challengeId,
          userId
        );

        return interaction.editReply(result.message);
      }

      // Convert Winnings to Tickets - Show bundle selection
      if (interaction.customId === "CONVERT_WINNINGS_TO_TICKETS") {
        const Profile = require("../models/profileSchema");
        const { TICKET_BUNDLES } = require("../config/ticketBundles");
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

        const profile = await Profile.findOne({ serverId, userId });

        if (!profile || profile.winningsBalance <= 0) {
          return interaction.reply({
            content: "❌ You don't have any winnings to convert. Win some matches first!",
            flags: 64, // ephemeral
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("💰 Convert Winnings to Tickets")
          .setDescription(
            `**Your Winnings:** $${profile.winningsBalance.toFixed(2)}\n\n` +
            `Convert your winnings into tickets at the same rate as purchasing.\n` +
            `**Service fees apply** (same as ticket purchases).\n\n` +
            `**Available Conversions:**`
          )
          .setColor(0xffd700);

        const rows = [];
        let currentRow = [];

        TICKET_BUNDLES.forEach((bundle, index) => {
          const conversionPrice = bundle.price; // Full price including service fees
          const canAfford = profile.winningsBalance >= conversionPrice;
          const button = new ButtonBuilder()
            .setCustomId(`CONVERT_BUNDLE_${bundle.id}`)
            .setLabel(`${bundle.emoji} ${bundle.tickets} tickets - $${conversionPrice.toFixed(2)}`)
            .setStyle(canAfford ? (bundle.popular ? ButtonStyle.Success : ButtonStyle.Primary) : ButtonStyle.Secondary)
            .setDisabled(!canAfford);

          currentRow.push(button);

          // Add row every 3 buttons or at the end
          if (currentRow.length === 3 || index === TICKET_BUNDLES.length - 1) {
            rows.push(new ActionRowBuilder().addComponents(...currentRow));
            currentRow = [];
          }
        });

        return interaction.reply({
          embeds: [embed],
          components: rows,
          flags: 64, // ephemeral
        });
      }

      // Convert Winnings to Tickets - Process bundle selection
      if (interaction.customId.startsWith("CONVERT_BUNDLE_")) {
        await interaction.deferReply({ flags: 64 }); // ephemeral

        const bundleId = interaction.customId.replace("CONVERT_BUNDLE_", "");
        const { getBundleById } = require("../config/ticketBundles");
        const Profile = require("../models/profileSchema");

        const bundle = getBundleById(bundleId);
        if (!bundle) {
          return interaction.editReply("❌ Invalid bundle selected.");
        }

        const profile = await Profile.findOne({ serverId, userId });
        if (!profile) {
          return interaction.editReply("❌ Profile not found.");
        }

        // Calculate conversion with service fees (same as ticket purchase pricing)
        const conversionPrice = bundle.price; // Includes stake + service fee

        // Check if user has enough winnings
        if (profile.winningsBalance < conversionPrice) {
          return interaction.editReply(
            `❌ You don't have enough winnings. You need $${conversionPrice.toFixed(2)} but only have $${profile.winningsBalance.toFixed(2)}.`
          );
        }

        // Process conversion (service fees apply)
        profile.winningsBalance -= conversionPrice;
        profile.balance += bundle.tickets;
        await profile.save();

        return interaction.editReply(
          `✅ Successfully converted $${conversionPrice.toFixed(2)} into **${bundle.tickets} tickets**!\n\n` +
          `**Breakdown:**\n` +
          `• Stake: $${bundle.stake.toFixed(2)}\n` +
          `• Service Fee: $${bundle.serviceFee.toFixed(2)} (${bundle.serviceFeePercent}%)\n` +
          `• Total: $${bundle.price.toFixed(2)}\n\n` +
          `**New Winnings Balance:** $${profile.winningsBalance.toFixed(2)}\n` +
          `**New Ticket Balance:** ${profile.balance} tickets 🎫`
        );
      }

      // Prize catalog - Redeem button
      if (interaction.customId.startsWith("redeem_")) {
        const {
          ModalBuilder,
          TextInputBuilder,
          TextInputStyle,
          ActionRowBuilder,
        } = require("discord.js");

        const prizeId = interaction.customId.replace("redeem_", "");

        const modal = new ModalBuilder()
          .setCustomId(`SHIPPING_MODAL_${prizeId}`)
          .setTitle("Shipping Information");

        const fullName = new TextInputBuilder()
          .setCustomId("fullName")
          .setLabel("Full Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        const addressLine1 = new TextInputBuilder()
          .setCustomId("addressLine1")
          .setLabel("Address Line 1")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200);

        const addressLine2 = new TextInputBuilder()
          .setCustomId("addressLine2")
          .setLabel("Address Line 2 (Optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(200);

        const city = new TextInputBuilder()
          .setCustomId("city")
          .setLabel("City")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        const stateZip = new TextInputBuilder()
          .setCustomId("state")
          .setLabel("State")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("e.g., CA")
          .setMaxLength(2)
          .setMinLength(2);

        const zipCode = new TextInputBuilder()
          .setCustomId("zipCode")
          .setLabel("ZIP Code")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10);

        const phone = new TextInputBuilder()
          .setCustomId("phone")
          .setLabel("Phone Number (Optional)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("123-456-7890")
          .setMaxLength(20);

        modal.addComponents(
          new ActionRowBuilder().addComponents(fullName),
          new ActionRowBuilder().addComponents(addressLine1),
          new ActionRowBuilder().addComponents(city),
          new ActionRowBuilder().addComponents(stateZip),
          new ActionRowBuilder().addComponents(zipCode)
        );

        await interaction.showModal(modal);
        return;
      }

      // Prize catalog - View Prize button
      if (interaction.customId.startsWith("view_prize_")) {
        const { getPrizeById } = require("../services/prizeService");
        const {
          buildPrizeDetailEmbed,
          buildRedeemButton,
        } = require("../components/catalogPanel");
        const Profile = require("../models/profileSchema");

        const prizeId = interaction.customId.replace("view_prize_", "");

        const prize = await getPrizeById(prizeId);
        if (!prize) {
          return interaction.reply({
            content: "❌ Prize not found.",
            ephemeral: true,
          });
        }

        const profile = await Profile.findOne({
          userId: interaction.user.id,
          serverId: interaction.guild.id,
        });
        const userPoints = profile ? profile.winningsBalance : 0;

        const embed = buildPrizeDetailEmbed(prize, userPoints);
        const canRedeem =
          prize.active &&
          prize.stock > 0 &&
          profile &&
          profile.winningsBalance >= prize.pointCost;
        const redeemButton = buildRedeemButton(prize._id, canRedeem);

        return interaction.reply({
          embeds: [embed],
          components: [redeemButton],
          ephemeral: true,
        });
      }

      // Catalog - My Points button
      if (interaction.customId === "catalog_my_points") {
        const Profile = require("../models/profileSchema");

        const profile = await Profile.findOne({
          userId: interaction.user.id,
          serverId: interaction.guild.id,
        });

        if (!profile) {
          return interaction.reply({
            content:
              "❌ Profile not found. Join a tournament first to create your profile!",
            ephemeral: true,
          });
        }

        return interaction.reply({
          content:
            `💰 **Your Balance**\n\n` +
            `🎟️ **Tickets:** ${profile.balance ?? 0}\n` +
            `💵 **Cash Winnings:** $${(profile.winningsBalance ?? 0).toFixed(2)}\n\n` +
            `Win tournaments and matchmaking to earn cash!`,
          ephemeral: true,
        });
      }

      // Catalog - My Redemptions button
      if (interaction.customId === "catalog_redemptions") {
        const { getUserRedemptions } = require("../services/prizeService");
        const Profile = require("../models/profileSchema");

        const profile = await Profile.findOne({
          userId: interaction.user.id,
          serverId: interaction.guild.id,
        });

        if (!profile) {
          return interaction.reply({
            content: "❌ Profile not found.",
            ephemeral: true,
          });
        }

        const redemptions = await getUserRedemptions(
          interaction.user.id,
          interaction.guild.id,
          10
        );

        const statusEmoji = {
          pending: "⏳",
          approved: "✅",
          shipped: "📦",
          delivered: "🎉",
          cancelled: "❌",
        };

        let msg = `📦 **Your Redemptions**\n\n`;

        if (redemptions.length === 0) {
          msg += `You haven't redeemed any prizes yet.\nYou have **$${(profile.winningsBalance ?? 0).toFixed(2)}** in cash winnings available!`;
        } else {
          redemptions.forEach((r) => {
            msg +=
              `${statusEmoji[r.status]} **${r.prizeName}**\n` +
              `   Points: ${r.pointCost} • Status: ${r.status}\n` +
              `   Redeemed: <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>\n`;
            if (r.trackingNumber) {
              msg += `   Tracking: \`${r.trackingNumber}\`\n`;
            }
            msg += `\n`;
          });
        }

        return interaction.reply({
          content: msg,
          ephemeral: true,
        });
      }

      // Catalog - Refresh button
      if (interaction.customId === "catalog_refresh") {
        const { upsertCatalogPanel } = require("../components/catalogPanel");

        await interaction.deferUpdate();
        await upsertCatalogPanel(interaction.client, "all", 0);

        return interaction.followUp({
          content: "✅ Catalog refreshed!",
          ephemeral: true,
        });
      }

      // Catalog - Pagination buttons
      if (interaction.customId.startsWith("catalog_page_")) {
        const { upsertCatalogPanel } = require("../components/catalogPanel");

        const pageStr = interaction.customId.replace("catalog_page_", "");
        const page = parseInt(pageStr);

        if (isNaN(page)) return;

        await interaction.deferUpdate();
        await upsertCatalogPanel(interaction.client, "all", page);
      }

      // ToS Acceptance button
      if (interaction.customId === "accept_tos") {
        const { handleToSAcceptance } = require("../components/tosPanel");
        return await handleToSAcceptance(interaction);
      }

      // Payout button
      if (interaction.customId === "REQUEST_PAYOUT") {
        return handlePayoutButton(interaction);
      }

      // Analytics panel buttons
      if (interaction.customId === "analytics_refresh" || interaction.customId === "analytics_export" || interaction.customId === "analytics_reset") {
        const { handleAnalyticsButton } = require("../components/analyticsPanel");
        return await handleAnalyticsButton(interaction, interaction.client);
      }
    }

    // String select menus
    if (interaction.isStringSelectMenu()) {
      // Catalog category selector
      if (interaction.customId === "catalog_category") {
        const { upsertCatalogPanel } = require("../components/catalogPanel");

        await interaction.deferUpdate();

        const category = interaction.values[0];

        if (category === "featured") {
          // Show featured prizes
          const { getPrizes } = require("../services/prizeService");
          const result = await getPrizes({
            featured: true,
            page: 0,
            limit: 6,
          });

          await upsertCatalogPanel(interaction.client, "featured", 0);
        } else {
          await upsertCatalogPanel(interaction.client, category, 0);
        }

        return;
      }

      // Prize category selector (old slash command system - keep for compatibility)
      if (interaction.customId === "prize_category") {
        const { getPrizes } = require("../services/prizeService");
        const {
          buildCatalogEmbed,
          buildPaginationButtons,
          buildCategorySelectMenu,
        } = require("../components/prizeCatalog");

        await interaction.deferUpdate();

        const category = interaction.values[0];
        const filterCategory = category === "all" ? null : category;

        const result = await getPrizes({
          category: filterCategory,
          page: 0,
          limit: 5,
        });

        const embed = buildCatalogEmbed(
          result.prizes,
          result.page,
          result.totalPages,
          category
        );
        const pagination = buildPaginationButtons(
          result.page,
          result.totalPages,
          result.hasMore
        );
        const categoryMenu = buildCategorySelectMenu();

        await interaction.editReply({
          embeds: [embed],
          components: [categoryMenu, pagination],
        });

        return;
      }
    }
  },
};
