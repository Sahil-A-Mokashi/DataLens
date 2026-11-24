
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
      required: true,
      min: 1
    },

    // Complete dataset snapshot for this version.
    records: {
      type: [mongoose.Schema.Types.Mixed],
      required: true,
      select: false
    },

    // Column structure at the time this version was created.
    columns: {
      type: [String],
      default: []
    },

    originalColumns: {
      type: [String],
      default: []
    },

    archivedColumns: {
      type: [mongoose.Schema.Types.Mixed],
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

    // Historical column profiling.
    profile: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },

    // Historical overall data quality score.
    qualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },

    previousQualityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },

    qualityMetrics: {
      completeness: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      validity: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      uniqueness: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      consistency: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      schemaCompliance: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      structuralIntegrity: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      }
    },

    // Historical ML readiness assessment.
    mlReadiness: {
      score: {
        type: Number,
        min: 0,
        max: 100,
        default: null
      },
      potentialScore: {
        type: Number,
        min: 0,
        max: 100,
        default: null
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

    // Details of operations performed to create this version.
    changeSummary: {
      operation: {
        type: String,
        default: "initial"
      },

      description: {
        type: String,
        default: "Dataset version created"
      },

      missingValuesFilled: {
        type: Number,
        default: 0
      },

      invalidValuesReplaced: {
        type: Number,
        default: 0
      },

      outliersReplaced: {
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

      columnsAdded: {
        type: Number,
        default: 0
      },

      columnsRemoved: {
        type: Number,
        default: 0
      },

      columnsRenamed: {
        type: Number,
        default: 0
      },

      columnsModified: {
        type: Number,
        default: 0
      },

      columnStrategies: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
      },

      structuralChanges: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
      }
    },

    // Before-and-after readiness comparison.
    previousMlReadinessScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },

    // Prevents deleting the original uploaded snapshot.
    isOriginal: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Every dataset must have unique version numbers.
datasetVersionSchema.index(
  { dataset: 1, versionNumber: 1 },
  { unique: true }
);

// Efficient version history retrieval.
datasetVersionSchema.index({
  dataset: 1,
  createdAt: -1
});

module.exports = mongoose.model(
  "DatasetVersion",
  datasetVersionSchema
);
