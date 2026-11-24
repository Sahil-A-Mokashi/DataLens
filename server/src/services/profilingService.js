
const isMissing = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

const classifyValue = (value) => {
  if (isMissing(value)) return "empty";

  const text = String(value).trim();
  const lower = text.toLowerCase();

  if (["true", "false", "yes", "no"].includes(lower)) {
    return "boolean";
  }

  if (
    typeof value === "number" ||
    /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)
  ) {
    return "numeric";
  }

  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{4}-\d{2}-\d{2}[T\s].+/,
    /^\d{1,2}\/\d{1,2}\/\d{4}$/,
    /^\d{1,2}-\d{1,2}-\d{4}$/
  ];

  if (
    datePatterns.some((pattern) => pattern.test(text)) &&
    !Number.isNaN(Date.parse(text))
  ) {
    return "date";
  }

  return "categorical";
};

const detectType = (values) => {
  const nonMissing = values.filter((value) => !isMissing(value));

  if (!nonMissing.length) return "empty";

  const counts = {
    numeric: 0,
    boolean: 0,
    date: 0,
    categorical: 0
  };

  nonMissing.forEach((value) => {
    const type = classifyValue(value);
    if (counts[type] !== undefined) counts[type]++;
  });

  const ranked = Object.entries(counts).sort(
    (a, b) => b[1] - a[1]
  );

  const [dominantType, dominantCount] = ranked[0];

  return dominantCount / nonMissing.length >= 0.8
    ? dominantType
    : "mixed";
};

const median = (values) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const getMode = (values) => {
  if (!values.length) return null;

  const frequencies = new Map();

  values.forEach((value) => {
    frequencies.set(value, (frequencies.get(value) || 0) + 1);
  });

  let mode = null;
  let highestFrequency = 0;

  for (const [value, frequency] of frequencies.entries()) {
    if (frequency > highestFrequency) {
      mode = value;
      highestFrequency = frequency;
    }
  }

  return {
    value: mode,
    frequency: highestFrequency
  };
};

const percentile = (values, percentileValue) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  return (
    sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower)
  );
};

// IQR-based outlier detection.
// Row numbers refer to CSV row numbers, including the header.
const detectOutliers = (values) => {
  const numericEntries = [];

  values.forEach((value, index) => {
    if (isMissing(value)) return;

    if (classifyValue(value) !== "numeric") return;

    const numericValue = Number(value);

    if (Number.isFinite(numericValue)) {
      numericEntries.push({
        row: index + 2,
        value: numericValue
      });
    }
  });

  if (numericEntries.length < 4) {
    return {
      method: "IQR",
      eligibleCount: numericEntries.length,
      outlierCount: 0,
      outlierPercentage: 0,
      lowerBound: null,
      upperBound: null,
      q1: null,
      q3: null,
      iqr: null,
      outliers: [],
      status: "insufficient_data"
    };
  }

  const numericValues = numericEntries.map((item) => item.value);

  const q1 = percentile(numericValues, 0.25);
  const q3 = percentile(numericValues, 0.75);
  const iqr = q3 - q1;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = numericEntries
    .filter(
      (item) =>
        item.value < lowerBound ||
        item.value > upperBound
    )
    .map((item) => ({
      row: item.row,
      value: item.value,
      direction: item.value < lowerBound ? "low" : "high"
    }));

  return {
    method: "IQR",
    eligibleCount: numericEntries.length,
    outlierCount: outliers.length,
    outlierPercentage: Number(
      ((outliers.length / numericEntries.length) * 100).toFixed(2)
    ),
    lowerBound: Number(lowerBound.toFixed(4)),
    upperBound: Number(upperBound.toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4)),
    iqr: Number(iqr.toFixed(4)),
    outliers,
    status: "analysed"
  };
};

const calculateNumericStats = (values) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;

  const variance =
    values.reduce(
      (total, value) => total + (value - mean) ** 2,
      0
    ) / values.length;

  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = values
    .map((value, index) => ({
      row: index + 2,
      value
    }))
    .filter(
      (item) =>
        item.value < lowerBound ||
        item.value > upperBound
    );

  return {
    mean: Number(mean.toFixed(4)),
    median: Number(median(sorted).toFixed(4)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    standardDeviation: Number(Math.sqrt(variance).toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4)),
    iqr: Number(iqr.toFixed(4)),
    lowerBound: Number(lowerBound.toFixed(4)),
    upperBound: Number(upperBound.toFixed(4)),
    outlierCount: outliers.length,
    outlierPercentage: Number(
      ((outliers.length / values.length) * 100).toFixed(2)
    ),
    outliers
  };
};

const validateColumnSchema = (values, expectedType) => {
  const allowedTypes = [
    "numeric",
    "categorical",
    "boolean",
    "date"
  ];

  if (!allowedTypes.includes(expectedType)) {
    return {
      expectedType,
      validCount: 0,
      mismatchCount: 0,
      mismatchPercentage: 0,
      mismatches: [],
      status: "unsupported_type"
    };
  }

  const nonMissing = values.filter((value) => !isMissing(value));

  if (!nonMissing.length) {
    return {
      expectedType,
      validCount: 0,
      mismatchCount: 0,
      mismatchPercentage: 0,
      mismatches: [],
      status: "empty"
    };
  }

  const mismatches = [];
  let validCount = 0;

  values.forEach((value, index) => {
    if (isMissing(value)) return;

    const actualType = classifyValue(value);
    const isValid = actualType === expectedType;

    if (isValid) {
      validCount++;
    } else {
      mismatches.push({
        row: index + 2,
        value: String(value),
        detectedType: actualType,
        expectedType
      });
    }
  });

  const mismatchCount = mismatches.length;

  return {
    expectedType,
    validCount,
    mismatchCount,
    mismatchPercentage: Number(
      ((mismatchCount / nonMissing.length) * 100).toFixed(2)
    ),
    mismatches,
    status: mismatchCount > 0 ? "mismatch" : "valid"
  };
};

const profileColumn = (records, column) => {
  const values = records.map((record) => record[column]);

  const nonMissing = values.filter(
    (value) => !isMissing(value)
  );

  const distinctValues = new Set(
    nonMissing.map((value) => String(value).trim())
  );

  const missingCount = values.length - nonMissing.length;
  const uniqueCount = distinctValues.size;
  const inferredType = detectType(values);

  // Mixed columns need manual schema selection.
  // Do not incorrectly mark every value as invalid.
  const schemaValidation =
    inferredType === "mixed" || inferredType === "empty"
      ? {
          expectedType: inferredType,
          validCount: 0,
          mismatchCount: 0,
          mismatchPercentage: 0,
          mismatches: [],
          status: "review_required"
        }
      : validateColumnSchema(values, inferredType);

  // Detect outliers among numeric values even if a column
  // contains a small number of non-numeric entries.
  const numericValues = nonMissing
    .filter((value) => classifyValue(value) === "numeric")
    .map(Number)
    .filter(Number.isFinite);

  const frequencies = new Map();

  nonMissing.forEach((value) => {
    const key = String(value).trim();

    frequencies.set(
      key,
      (frequencies.get(key) || 0) + 1
    );
  });

  const mode = getMode(
    nonMissing.map((value) => String(value).trim())
  );

  const isConstant =
    nonMissing.length > 0 && uniqueCount === 1;

  const isHighCardinality =
    nonMissing.length > 0 &&
    uniqueCount / nonMissing.length >= 0.9;

  const whitespaceCount = values.filter(
    (value) =>
      typeof value === "string" &&
      value !== value.trim()
  ).length;

  const duplicateValueCount = nonMissing.length - uniqueCount;

  const numericStats = calculateNumericStats(numericValues);
  const outlierDetection = detectOutliers(values);

  const profile = {
    column,
    inferredType,
    totalCount: values.length,
    nonMissingCount: nonMissing.length,
    missingCount,

    missingPercentage: values.length
      ? Number(
          ((missingCount / values.length) * 100).toFixed(2)
        )
      : 0,

    uniqueCount,
    duplicateValueCount,

    distinctPercentage: nonMissing.length
      ? Number(
          ((uniqueCount / nonMissing.length) * 100).toFixed(2)
        )
      : 0,

    mode,
    isConstant,
    isHighCardinality,
    whitespaceCount,
    numericStats,
    outlierDetection,

    categoryFrequencies:
      inferredType === "categorical"
        ? Array.from(frequencies.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20)
        : [],

    schemaValidation,
    warnings: []
  };

  if (missingCount > 0) {
    profile.warnings.push({
      type: "missing_values",
      severity:
        missingCount / Math.max(values.length, 1) > 0.2
          ? "high"
          : "medium",
      message: `${missingCount} missing values detected`
    });
  }

  if (schemaValidation.mismatchCount > 0) {
    profile.warnings.push({
      type: "schema_mismatch",
      severity: "high",
      message:
        `${schemaValidation.mismatchCount} values do not match the inferred ${inferredType} type`
    });
  }

  if (inferredType === "mixed") {
    profile.warnings.push({
      type: "mixed_data_types",
      severity: "high",
      message:
        "No single data type dominates this column. Manual schema selection is recommended."
    });
  }

  if (isConstant) {
    profile.warnings.push({
      type: "constant_column",
      severity: "high",
      message: "This column contains only one distinct value"
    });
  }

  if (isHighCardinality) {
    profile.warnings.push({
      type: "high_cardinality",
      severity: "medium",
      message:
        "This column has a high proportion of distinct values"
    });
  }

  if (whitespaceCount > 0) {
    profile.warnings.push({
      type: "whitespace",
      severity: "low",
      message:
        `${whitespaceCount} values contain leading or trailing whitespace`
    });
  }

  if (outlierDetection.outlierCount > 0) {
    profile.warnings.push({
      type: "outliers",
      severity: "medium",
      message:
        `${outlierDetection.outlierCount} possible outliers detected using the IQR method`
    });
  }

  return profile;
};

// Calculates dataset-level measurements and readiness estimates.
const calculateDatasetAssessment = (
  records,
  columns,
  columnProfiles
) => {
  const rowCount = records.length;
  const columnCount = columns.length;
  const totalCells = rowCount * columnCount;

  let missingCount = 0;
  let nonMissingCount = 0;
  let schemaCheckedCount = 0;
  let schemaValidCount = 0;
  let whitespaceCount = 0;
  let outlierCount = 0;
  let numericObservationCount = 0;

  columnProfiles.forEach((profile) => {
    missingCount += profile.missingCount;
    nonMissingCount += profile.nonMissingCount;
    whitespaceCount += profile.whitespaceCount;

    if (
      profile.schemaValidation.status === "valid" ||
      profile.schemaValidation.status === "mismatch"
    ) {
      schemaCheckedCount += profile.nonMissingCount;
      schemaValidCount += profile.schemaValidation.validCount;
    }

    outlierCount += profile.outlierDetection.outlierCount;
    numericObservationCount +=
      profile.outlierDetection.eligibleCount;
  });

  // Count duplicated complete rows.
  const rowFrequencies = new Map();

  records.forEach((record) => {
    const key = JSON.stringify(
      columns.map((column) => record[column] ?? null)
    );

    rowFrequencies.set(
      key,
      (rowFrequencies.get(key) || 0) + 1
    );
  });

  let duplicateRows = 0;

  rowFrequencies.forEach((count) => {
    if (count > 1) duplicateRows += count - 1;
  });

  const completeness =
    totalCells > 0
      ? (nonMissingCount / totalCells) * 100
      : null;

  const schemaCompliance =
    schemaCheckedCount > 0
      ? (schemaValidCount / schemaCheckedCount) * 100
      : null;

  const uniqueness =
    rowCount > 0
      ? ((rowCount - duplicateRows) / rowCount) * 100
      : null;

  const consistency =
    nonMissingCount > 0
      ? ((nonMissingCount - whitespaceCount) /
          nonMissingCount) * 100
      : null;

  const validity =
    schemaCompliance;

  // Structural integrity is based on measurable structural
  // indicators, not on whether the dataset is predictive.
  const structuralIntegrity =
    columnCount > 0
      ? (
          columnProfiles.filter(
            (profile) =>
              !profile.isConstant &&
              profile.inferredType !== "empty"
          ).length / columnCount
        ) * 100
      : null;

  const qualityMetrics = {
    completeness:
      completeness === null ? null : Number(completeness.toFixed(2)),
    validity:
      validity === null ? null : Number(validity.toFixed(2)),
    uniqueness:
      uniqueness === null ? null : Number(uniqueness.toFixed(2)),
    consistency:
      consistency === null ? null : Number(consistency.toFixed(2)),
    schemaCompliance:
      schemaCompliance === null
        ? null
        : Number(schemaCompliance.toFixed(2)),
    structuralIntegrity:
      structuralIntegrity === null
        ? null
        : Number(structuralIntegrity.toFixed(2))
  };

  // Quality score uses available assessed dimensions only.
  // Missing dimensions are not silently treated as 100.
  const qualityWeights = {
    completeness: 0.25,
    validity: 0.20,
    uniqueness: 0.15,
    consistency: 0.15,
    schemaCompliance: 0.15,
    structuralIntegrity: 0.10
  };

  let qualityWeightedTotal = 0;
  let qualityAvailableWeight = 0;

  Object.entries(qualityWeights).forEach(([key, weight]) => {
    const value = qualityMetrics[key];

    if (value !== null) {
      qualityWeightedTotal += value * weight;
      qualityAvailableWeight += weight;
    }
  });

  const qualityScore =
    qualityAvailableWeight > 0
      ? Number(
          (qualityWeightedTotal / qualityAvailableWeight).toFixed(2)
        )
      : null;

  // ML readiness is an initial heuristic assessment.
  // Outliers are deliberately not treated as automatic errors.
  const readinessWeights = {
    completeness: 0.25,
    validity: 0.20,
    uniqueness: 0.15,
    consistency: 0.15,
    schemaCompliance: 0.15,
    structuralIntegrity: 0.10
  };

  let readinessTotal = 0;
  let readinessAvailableWeight = 0;

  Object.entries(readinessWeights).forEach(([key, weight]) => {
    const value = qualityMetrics[key];

    if (value !== null) {
      readinessTotal += value * weight;
      readinessAvailableWeight += weight;
    }
  });

  const currentReadiness =
    readinessAvailableWeight > 0
      ? readinessTotal / readinessAvailableWeight
      : null;

  // Potential readiness assumes measurable missing values,
  // schema mismatches, duplicate rows and whitespace issues
  // can be corrected. It does not assume outliers are errors.
  const potentialMetrics = {
    ...qualityMetrics,
    completeness: completeness === null ? null : 100,
    validity: validity === null ? null : 100,
    schemaCompliance:
      schemaCompliance === null ? null : 100,
    uniqueness: uniqueness === null ? null : 100,
    consistency: consistency === null ? null : 100
  };

  let potentialTotal = 0;
  let potentialAvailableWeight = 0;

  Object.entries(readinessWeights).forEach(([key, weight]) => {
    const value = potentialMetrics[key];

    if (value !== null) {
      potentialTotal += value * weight;
      potentialAvailableWeight += weight;
    }
  });

  const potentialReadiness =
    potentialAvailableWeight > 0
      ? Number(
          (potentialTotal / potentialAvailableWeight).toFixed(2)
        )
      : null;

  const outlierPercentage =
    numericObservationCount > 0
      ? Number(
          ((outlierCount / numericObservationCount) * 100).toFixed(2)
        )
      : 0;

  const correctionOpportunities = {
    missingValues: missingCount,
    schemaMismatches: columnProfiles.reduce(
      (total, profile) =>
        total + profile.schemaValidation.mismatchCount,
      0
    ),
    duplicateRows,
    whitespaceValues: whitespaceCount,
    outliers: outlierCount
  };

  return {
    qualityScore,
    qualityMetrics,

    outlierSummary: {
      totalOutliers: outlierCount,
      numericObservations: numericObservationCount,
      outlierPercentage,
      affectedColumns: columnProfiles.filter(
        (profile) => profile.outlierDetection.outlierCount > 0
      ).length
    },

    issueSummary: {
      missingValues: missingCount,
      duplicateRows,
      invalidValues: correctionOpportunities.schemaMismatches,
      outliers: outlierCount
    },

    mlReadiness: {
      score:
        currentReadiness === null
          ? null
          : Number(currentReadiness.toFixed(2)),
      potentialScore: potentialReadiness,
      improvementOpportunity:
        currentReadiness === null || potentialReadiness === null
          ? null
          : Number(
              (potentialReadiness - currentReadiness).toFixed(2)
            ),
      level:
        currentReadiness === null
          ? null
          : currentReadiness >= 80
            ? "high"
            : currentReadiness >= 60
              ? "moderate"
              : "low",
      warnings: [],
      scoreType: "heuristic_readiness_not_model_accuracy"
    },

    correctionOpportunities
  };
};

const profileDataset = (records, columns) => {
  const columnProfiles = columns.map((column) =>
    profileColumn(records, column)
  );

  const assessment = calculateDatasetAssessment(
    records,
    columns,
    columnProfiles
  );

  return {
    rowCount: records.length,
    columnCount: columns.length,
    columns: columnProfiles,
    ...assessment,
    analysedAt: new Date()
  };
};

module.exports = {
  profileDataset,
  profileColumn,
  detectType,
  classifyValue,
  validateColumnSchema,
  detectOutliers,
  calculateNumericStats,
  calculateDatasetAssessment,
  isMissing,
  median,
  getMode
};
