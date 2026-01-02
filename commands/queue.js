const { SlashCommandBuilder } = require("discord.js");
const TIERS = require("../config/tiers");
const { join, leave } = require("../services/queueService");
const { refreshPanel } = require("../Components/queuePanel");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Join/leave the tournament queue.")
    .addSubcommand((sc) =>
      sc
        .setName("join")
        .setDescription("Join a tier queue.")
        .addStringOption((opt) =>
          opt
            .setName("tier")
            .setDescription("Choose a tier")
            .setRequired(true)
            .addChoices(
              { name: "T1", value: "T1" },
              { name: "T5", value: "T5" },
              { name: "T10", value: "T10" },
              { name: "T20", value: "T20" }
            )
        )
    )
    .addSubcommand((sc) =>
      sc.setName("leave").setDescription("Leave your current queue.")
    )
    .addSubcommand((sc) =>
      sc.setName("status").setDescription("Show queue counts.")
    ),
  async execute(interaction) {
    const serverId = interaction.guild.id;
    const userId = interaction.user.id;

    const sub = interaction.options.getSubcommand();
    if (sub === "join") {
      const tierKey = interaction.options.getString("tier");
      await interaction.deferReply({ ephemeral: true });
      const res = await join(serverId, userId, tierKey);
      await refreshPanel(interaction.client);
      return interaction.editReply(res.msg);
    }
    if (sub === "leave") {
      await interaction.deferReply({ ephemeral: true });
      const res = await leave(serverId, userId);
      await refreshPanel(interaction.client);
      return interaction.editReply(res.msg);
    }
    if (sub === "status") {
      const counts = await Promise.all(
        TIERS.map(async (t) => {
          const QueueEntry = require("../models/QueueEntry");
          const n = await QueueEntry.countDocuments({
            serverId,
            tierKey: t.key,
          });
          return `${t.label}: ${n}`;
        })
      );
      return interaction.reply({
        ephemeral: true,
        content: counts.join(" • "),
      });
    }
  },
};
