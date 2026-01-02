const { Schema: Schema2, model: model2 } = require("mongoose");

const QueueEntry2v2Schema = new Schema2(
  {
    serverId: { type: String, required: true, index: true },
    tierKey: { type: String, required: true, index: true },
    teamId: { type: String, required: true }, // Reference to Team
    joinedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

QueueEntry2v2Schema.index({ serverId: 1, tierKey: 1, joinedAt: 1 });

module.exports = model2("QueueEntry2v2", QueueEntry2v2Schema);
