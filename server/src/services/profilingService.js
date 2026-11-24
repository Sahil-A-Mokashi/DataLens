
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

  // Accept common date formats, but avoid treating arbitrary text
  // as a date merely because Date.parse() accepts it.
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
    counts[classifyValue(value)]++;
  });

  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);

  const [dominantType, dominantCount] = ranked[0];
  const confidence = dominantCount / nonMissing.length;

  // A dominant type is suggested when at least 80% of
  // non-empty values follow the same pattern.
  if (confidence >= 0.8) {
    return dominantType;
  }

  return "mixed";
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

  return { value: mode, frequency: highestFrequency };
};

const percentile = (values, percentileValue) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower);
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

  const outlierCount = values.filter(
    (value) => value < lowerBound || value > upperBound
  ).length;

  return {
    mean: Number(mean.toFixed(4)),
    median: Number(median(sorted).toFixed(4)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    standardDeviation: Number(Math.sqrt(variance).toFixed(4)),
    q1: Number(q1.toFixed(4)),
    q3: Number(q3.toFixed(4)),
    outlierCount,
    outlierPercentage: Number(
      ((outlierCount / values.length) * 100).toFixed(2)
    )
  };
};

const validateColumnSchema = (values, inferredType) => {
  const nonMissing = values.filter((value) => !isMissing(value));

  if (["empty", "mixed"].includes(inferredType)) {
    return {
      expectedType: inferredType,
      validCount: 0,
      mismatchCount: 0,
      mismatchPercentage: 0,
      mismatches: [],
      status: inferredType === "empty" ? "empty" : "review_required"
    };
  }

  const mismatches = [];
  let validCount = 0;

  values.forEach((value, index) => {
    if (isMissing(value)) return;

    const actualType = classifyValue(value);

    if (actualType === inferredType) {
      validCount++;
    } else {
      mismatches.push({
        row: index + 2,
        value: String(value),
        detectedType: actualType,
        expectedType: inferredType
      });
    }
  });

  const mismatchCount = mismatches.length;

  return {
    expectedType: inferredType,
    validCount,
    mismatchCount,
    mismatchPercentage: nonMissing.length
      ? Number(
          ((mismatchCount / nonMissing.length) * 100).toFixed(2)
        )
      : 0,
    mismatches,
    status: mismatchCount > 0 ? "mismatch" : "valid"
  };
};

const profileColumn = (records, column) => {
  const values = records.map((record) => record[column]);
  const nonMissing = values.filter((value) => !isMissing(value));
  const distinctValues = new Set(
    nonMissing.map((value) => String(value))
  );

  const missingCount = values.length - nonMissing.length;
  const uniqueCount = distinctValues.size;
  const inferredType = detectType(values);

  const schemaValidation = validateColumnSchema(
    values,
    inferredType
  );

  const numericValues =
    inferredType === "numeric"
      ? nonMissing.map(Number)
      : [];

  const frequencies = new Map();

  nonMissing.forEach((value) => {
    const key = String(value).trim();
    frequencies.set(key, (frequencies.get(key) || 0) + 1);
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

  const profile = {
    column,
    inferredType,
    totalCount: values.length,
    nonMissingCount: nonMissing.length,
    missingCount,
    missingPercentage: values.length
      ? Number(((missingCount / values.length) * 100).toFixed(2))
      : 0,
    uniqueCount,
    duplicateValueCount,
    distinctPercentage: nonMissing.length
      ? Number(((uniqueCount / nonMissing.length) * 100).toFixed(2))
      : 0,
    mode,
    isConstant,
    isHighCardinality,
    whitespaceCount,
    numericStats: calculateNumericStats(numericValues),
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
      message: "No single data type dominates this column. Manual schema selection is recommended."
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
      message: "This column has a high proportion of distinct values"
    });
  }

  if (whitespaceCount > 0) {
    profile.warnings.push({
      type: "whitespace",
      severity: "low",
      message: `${whitespaceCount} values contain leading or trailing whitespace`
    });
  }

  if (profile.numericStats?.outlierCount > 0) {
    profile.warnings.push({
      type: "outliers",
      severity: "medium",
      message:
        `${profile.numericStats.outlierCount} possible outliers detected using the IQR method`
    });
  }

  return profile;
};

const profileDataset = (records, columns) => {
  const columnProfiles = columns.map((column) =>
    profileColumn(records, column)
  );

  return {
    rowCount: records.length,
    columnCount: columns.length,
    columns: columnProfiles,
    analysedAt: new Date()
  };
};

module.exports = {
  profileDataset,
  profileColumn,
  detectType,
  classifyValue,
  validateColumnSchema
};
