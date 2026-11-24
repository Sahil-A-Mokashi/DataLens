
const mongoose = require("mongoose");

const datasetSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150
    },

    originalFilename: {
      type: String,
      required: true
    },

    // Currently active columns
    columns: {
      type: [String],
      required: true,
      default: []
    },

    // Removed columns are archived so they can be restored.
    archivedColumns: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    // Original uploaded column names, retained for reference.
    originalColumns: {
      type: [String],
      default: []
    },

    rowCount: {
      type: Number,
      required: true,
      min: 0
    },

    columnCount: {
      type: Number,
      required: true,
      min: 0
    },

    // Current active dataset records.
    records: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
      select: false
    },

    // Overall data quality score.
    qualityScore: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },

    // Six independently calculated quality dimensions.
    qualityMetrics: {
      completeness: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      validity: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      uniqueness: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      consistency: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      schemaCompliance: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      structuralIntegrity: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      }
    },

    issueSummary: {
      missingValues: {
        type: Number,
        default: 0
      },
      duplicateRows: {
        type: Number,
        default: 0
      },
      invalidValues: {
        type: Number,
        default: 0
      },
      outliers: {
        type: Number,
        default: 0
      }
    },

    outlierSummary: {
      totalOutliers: {
        type: Number,
        default: 0
      },
      numericObservations: {
        type: Number,
        default: 0
      },
      outlierPercentage: {
        type: Number,
        default: 0
      },
      affectedColumns: {
        type: Number,
        default: 0
      }
    },

    // Current and potential ML-readiness estimates.
    mlReadiness: {
      score: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      potentialScore: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      improvementOpportunity: {
        type: Number,
        default: null
      },
      level: {
        type: String,
        enum: ["low", "moderate", "high", null],
        default: null
      },
      warnings: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
      },
      scoreType: {
        type: String,
        default: "heuristic_readiness_not_model_accuracy"
      }
    },

    // Counts of issues that may be corrected.
    correctionOpportunities: {
      missingValues: {
        type: Number,
        default: 0
      },
      schemaMismatches: {
        type: Number,
        default: 0
      },
      duplicateRows: {
        type: Number,
        default: 0
      },
      whitespaceValues: {
        type: Number,
        default: 0
      },
      outliers: {
        type: Number,
        default: 0
      }
    },

    // Column-level profiling results.
    profile: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    // Structural changes and warnings.
    structuralIssues: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    // Tracks the most recent profiling run.
    lastAnalysisAt: {
      type: Date,
      default: null
    },

    status: {
      type: String,
      enum: ["uploaded", "analysed", "cleaned"],
      default: "uploaded"
    }
  },
  {
    timestamps: true
  }
);

// Efficient owner-specific dataset listing.
datasetSchema.index({
  owner: 1,
  createdAt: -1
});

module.exports = mongoose.model("Dataset", datasetSchema);
