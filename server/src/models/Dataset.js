
const mongoose = require("mongoose");

const datasetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    originalFilename: {
      type: String,
      required: true,
    },

    columns: {
      type: [String],
      required: true,
    },

    rowCount: {
      type: Number,
      required: true,
      min: 0,
    },

    columnCount: {
      type: Number,
      required: true,
      min: 0,
    },

    records: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      select: false,
    },

    // Overall data quality score (0–100)
    qualityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    // Existing issue counts — retained for compatibility
    issueSummary: {
      missingValues: { type: Number, default: 0 },
      duplicateRows: { type: Number, default: 0 },
      invalidValues: { type: Number, default: 0 },
    },

    // Detailed quality dimensions
    qualityMetrics: {
      completeness: { type: Number, default: 100 },
      validity: { type: Number, default: 100 },
      consistency: { type: Number, default: 100 },
      uniqueness: { type: Number, default: 100 },
    },

    // Per-column profiling results
    profile: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // CSV structure and parsing warnings
    structuralIssues: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    // Heuristic assessment — not measured model performance
    mlReadiness: {
      score: { type: Number, min: 0, max: 100 },
      level: {
        type: String,
        enum: ["low", "moderate", "high", null],
        default: null,
      },
      warnings: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
      },
    },

    lastAnalysisAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["uploaded", "analysed", "cleaned"],
      default: "uploaded",
    },
  },
  {
    timestamps: true,
  }
);

datasetSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("Dataset", datasetSchema);
