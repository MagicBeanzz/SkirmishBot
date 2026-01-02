const { SlashCommandBuilder } = require("discord.js");
const Team = require("../models/Team");
const Profile = require("../models/profileSchema");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("team")
    .setDescription("Manage your 2v2 wingman team")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new 2v2 team")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Your team name")
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(30)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("invite")
        .setDescription("Invite a partner to your team")
        .addUserOption((opt) =>
          opt
            .setName("partner")
            .setDescription("Your teammate")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("disband").setDescription("Disband your current team")
    )
    .addSubcommand((sub) =>
      sub.setName("info").setDescription("View your current team info")
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const serverId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      // Check if user already has a team
      const existing = await Team.findOne({
        serverId,
        $or: [{ leaderId: userId }, { partnerId: userId }],
        status: { $in: ["forming", "ready"] },
      });

      if (existing) {
        return interaction.editReply(
          "❌ You're already in a team! Use `/team disband` first."
        );
      }

      const teamName =
        interaction.options.getString("name") ||
        `${interaction.user.username}'s Team`;

      const team = await Team.create({
        serverId,
        teamName,
        leaderId: userId,
        status: "forming",
      });

      return interaction.editReply(
        `✅ **Team Created: ${teamName}**\n\n` +
          `You can now:\n` +
          `• Use \`/team invite @partner\` to add a teammate\n` +
          `• OR queue solo in 2v2 and get auto-paired\n\n` +
          `Team ID: \`${team.id}\``
      );
    }

    if (sub === "invite") {
      const partner = interaction.options.getUser("partner");

      if (partner.id === userId) {
        return interaction.editReply("❌ You can't invite yourself!");
      }

      if (partner.bot) {
        return interaction.editReply("❌ You can't invite bots!");
      }

      // Check if user is team leader
      const team = await Team.findOne({
        serverId,
        leaderId: userId,
        status: "forming",
      });

      if (!team) {
        return interaction.editReply(
          "❌ You don't have a team! Use `/team create` first."
        );
      }

      if (team.partnerId) {
        return interaction.editReply(
          "❌ Your team already has a partner! Disband and recreate to invite someone else."
        );
      }

      // Check if partner is already in a team
      const partnerTeam = await Team.findOne({
        serverId,
        $or: [{ leaderId: partner.id }, { partnerId: partner.id }],
        status: { $in: ["forming", "ready"] },
      });

      if (partnerTeam) {
        return interaction.editReply(
          `❌ ${partner.username} is already in a team!`
        );
      }

      // Send invite
      const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        EmbedBuilder,
      } = require("discord.js");

      const embed = new EmbedBuilder()
        .setTitle("🎮 Team Invite")
        .setDescription(
          `${interaction.user} has invited you to join **${team.teamName}** for 2v2 Wingman tournaments!`
        )
        .addFields(
          { name: "Team Leader", value: `<@${userId}>`, inline: true },
          { name: "Team Name", value: team.teamName, inline: true }
        )
        .setColor(0x5865f2)
        .setFooter({ text: "This invite expires in 5 minutes" });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`TEAM_ACCEPT_${team.id}`)
          .setLabel("✅ Accept")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`TEAM_DECLINE_${team.id}`)
          .setLabel("❌ Decline")
          .setStyle(ButtonStyle.Danger)
      );

      try {
        const msg = await partner.send({
          embeds: [embed],
          components: [buttons],
        });

        team.inviteMessageId = msg.id;
        await team.save();

        // Auto-expire after 5 minutes
        setTimeout(async () => {
          const freshTeam = await Team.findById(team.id);
          if (
            freshTeam &&
            freshTeam.status === "forming" &&
            !freshTeam.partnerId
          ) {
            freshTeam.status = "disbanded";
            await freshTeam.save();
          }
        }, 5 * 60 * 1000);

        return interaction.editReply(
          `✅ Invite sent to ${partner}! They have 5 minutes to accept.`
        );
      } catch (err) {
        return interaction.editReply(
          `❌ Couldn't send invite to ${partner}. They may have DMs disabled.`
        );
      }
    }

    if (sub === "disband") {
      const team = await Team.findOne({
        serverId,
        $or: [{ leaderId: userId }, { partnerId: userId }],
        status: { $in: ["forming", "ready"] },
      });

      if (!team) {
        return interaction.editReply("❌ You're not in a team!");
      }

      // If queued, remove from queue
      if (team.queuedFor) {
        const QueueEntry2v2 = require("../models/QueueEntry2v2");
        await QueueEntry2v2.deleteMany({ teamId: team.id });
      }

      team.status = "disbanded";
      await team.save();

      return interaction.editReply(
        `✅ Team disbanded. Both members can now create or join new teams.`
      );
    }

    if (sub === "info") {
      const team = await Team.findOne({
        serverId,
        $or: [{ leaderId: userId }, { partnerId: userId }],
        status: { $in: ["forming", "ready"] },
      });

      if (!team) {
        return interaction.editReply(
          "❌ You're not in a team! Use `/team create` to start one."
        );
      }

      let info = `**${team.teamName}**\n\n`;
      info += `• Leader: <@${team.leaderId}>\n`;
      info += `• Partner: ${
        team.partnerId ? `<@${team.partnerId}>` : "*Solo (will be auto-paired)*"
      }\n`;
      info += `• Status: ${team.status}\n`;
      if (team.queuedFor) {
        info += `• Queued for: ${team.queuedFor}\n`;
      }
      info += `\nTeam ID: \`${team.id}\``;

      return interaction.editReply(info);
    }
  },
};
