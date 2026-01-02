const { Schema, model } = require("mongoose");

/**
 * Prize Schema
 * Represents items in the prize catalog that users can redeem with points
 */
const PrizeSchema = new Schema(
  {
    // Basic info
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },

    // Visual
    imageUrl: { type: String, required: true }, // Discord CDN URL or external image host

    // Pricing & inventory
    pointCost: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 1 }, // Available quantity

    // Organization
    category: {
      type: String,
      required: true,
      enum: [
        "vintage",
        "modern",
        "graded",
        "sealed",
        "ultra-rare",
        "bulk",
        "other",
      ],
    },

    // Metadata
    featured: { type: Boolean, default: false }, // Show in featured section
    active: { type: Boolean, default: true }, // Can be redeemed

    // Pokemon card specific (optional fields)
    cardSet: { type: String, default: null }, // e.g., "Base Set", "Evolutions"
    cardNumber: { type: String, default: null }, // e.g., "4/102"
    condition: { type: String, default: null }, // e.g., "Near Mint", "PSA 10"
    rarity: { type: String, default: null }, // e.g., "Holo Rare", "Secret Rare"

    // Admin notes
    notes: { type: String, default: "" }, // Internal notes for admins
  },
  { timestamps: true }
);

// Indexes for efficient queries
PrizeSchema.index({ category: 1, active: 1 });
PrizeSchema.index({ featured: 1, active: 1 });
PrizeSchema.index({ name: "text", description: "text" }); // Text search

module.exports = model("Prize", PrizeSchema);
