
const mongoose = require("mongoose");

const datasetVersionSchema = new mongoose.Schema(
  {
    dataset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dataset",
      required: true,
      index: true
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    versionNumber: {
      type: Number,
      required: true
    },

    records: {
      type: [mongoose.Schema.Types.Mixed],
      required: true,
      select: false
    },

    // Summary of operations performed in this version
    changeSummary: {
      missingValuesFilled: {
        type: Number,
        default: 0
      },

      duplicateRowsRemoved: {
        type: Number,
        default: 0
      },

      rowsRemoved: {
        type: Number,
        default: 0
      },

      columnsModified: {
        type: Number,
        default: 0
      },

      // Retains the strategy selected for each column
      columnStrategies: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
      }
    },

    // Quality score before and after cleaning
    previousQualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },

    qualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  },
  {
    timestamps: true
  }
);

datasetVersionSchema.index(
  { dataset: 1, versionNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("DatasetVersion", datasetVersionSchema);
