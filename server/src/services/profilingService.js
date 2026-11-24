
const isMissing = (value) => {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
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
    frequency: highestFrequency,
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

const detectType = (values) => {
  const nonMissing = values.filter((value) => !isMissing(value));

  if (!nonMissing.length) return "empty";

  const numericCount = nonMissing.filter(
    (value) =>
      typeof value === "number" ||
      (typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value)))
  ).length;

  const booleanCount = nonMissing.filter(
    (value) =>
      typeof value === "boolean" ||
      ["true", "false", "yes", "no"].includes(
        String(value).trim().toLowerCase()
      )
  ).length;

  const dateCount = nonMissing.filter(
    (value) =>
      typeof value === "string" &&
      !Number.isFinite(Number(value)) &&
      !Number.isNaN(Date.parse(value))
  ).length;

  if (numericCount === nonMissing.length) return "numeric";
  if (booleanCount === nonMissing.length) return "boolean";
  if (dateCount === nonMissing.length) return "date";

  if (numericCount > 0 || dateCount > 0) return "mixed";

  return "categorical";
};

const calculateNumericStats = (values) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / values.length;

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;

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
    ),
  };
};

const profileColumn = (records, column) => {
  const values = records.map((record) => record[column]);
  const nonMissing = values.filter((value) => !isMissing(value));
  const distinctValues = new Set(nonMissing.map((value) => String(value)));

  const missingCount = values.length - nonMissing.length;
  const uniqueCount = distinctValues.size;

  const inferredType = detectType(values);

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

  const duplicateValueCount =
    nonMissing.length - uniqueCount;

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
    categoryFrequencies: inferredType === "categorical"
      ? Array.from(frequencies.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20)
      : [],
    warnings: [],
  };

  if (missingCount > 0) {
    profile.warnings.push({
      type: "missing_values",
      severity: missingCount / Math.max(values.length, 1) > 0.2
        ? "high"
        : "medium",
      message: `${missingCount} missing values detected`,
    });
  }

  if (isConstant) {
    profile.warnings.push({
      type: "constant_column",
      severity: "high",
      message: "This column contains only one distinct value",
    });
  }

  if (isHighCardinality) {
    profile.warnings.push({
      type: "high_cardinality",
      severity: "medium",
      message: "This column has a high proportion of distinct values",
    });
  }

  if (inferredType === "mixed") {
    profile.warnings.push({
      type: "mixed_data_types",
      severity: "medium",
      message: "This column may contain inconsistent data types",
    });
  }

  if (whitespaceCount > 0) {
    profile.warnings.push({
      type: "whitespace",
      severity: "low",
      message: `${whitespaceCount} values contain leading or trailing whitespace`,
    });
  }

  if (profile.numericStats?.outlierCount > 0) {
    profile.warnings.push({
      type: "outliers",
      severity: "medium",
      message: `${profile.numericStats.outlierCount} possible outliers detected using the IQR method`,
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
    analysedAt: new Date(),
  };
};

module.exports = {
  profileDataset,
  profileColumn,
  detectType,
};
