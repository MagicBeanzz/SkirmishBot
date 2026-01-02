const { SlashCommandBuilder } = require("discord.js");
const { reportWin } = require("../services/MatchService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reportwin")
    .setDescription("Report a match winner.")
    .addStringOption((o) =>
      o.setName("match").setDescription("Match ID").setRequired(true)
    )
    .addUserOption((o) =>
      o.setName("winner").setDescription("Winner user").setRequired(true)
    ),
  async execute(interaction) {
    const matchId = interaction.options.getString("match");
    const winner = interaction.options.getUser("winner");
    await interaction.deferReply({ ephemeral: true });

    const res = await reportWin(interaction.client, matchId, winner.id);
    return interaction.editReply(res.msg);
  },
};
