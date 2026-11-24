
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

    qualityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    issueSummary: {
      missingValues: { type: Number, default: 0 },
      duplicateRows: { type: Number, default: 0 },
      invalidValues: { type: Number, default: 0 },
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
