
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
    changeSummary: {
      missingValuesFilled: {
        type: Number,
        default: 0
      },
      duplicateRowsRemoved: {
        type: Number,
        default: 0
      }
    },
    qualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    }
  },
  { timestamps: true }
);

datasetVersionSchema.index(
  { dataset: 1, versionNumber: 1 },
  { unique: true }
);

module.exports = mongoose.model("DatasetVersion", datasetVersionSchema);
