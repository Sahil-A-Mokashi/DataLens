const Dataset = require("../models/Dataset");
const DatasetVersion = require("../models/DatasetVersion");
const Papa = require("papaparse");

const {
  profileDataset,
  classifyValue,
  isMissing,
  median,
  getMode
} = require("../services/profilingService");

// --------------------------------------------------
// SHARED HELPERS
// --------------------------------------------------

const round = (value) =>
  value === null || value === undefined
    ? null
    : Number(Number(value).toFixed(2));

const findDataset = async (id, owner) =>
  Dataset.findOne({ _id: id, owner }).select("+records");

const calculateReplacement = (values, method, customValue) => {
  const usable = values.filter((value) => !isMissing(value));

  if (method === "custom") {
    if (
      customValue === undefined ||
      customValue === null ||
      String(customValue).trim() === ""
    ) {
      throw new Error("A custom replacement value is required");
    }
    return String(customValue).trim();
  }

  if (method === "mode") {
    if (!usable.length) throw new Error("No valid values available to calculate mode");
    return getMode(usable.map((value) => String(value).trim()))?.value;
  }

  if (method === "mean" || method === "median") {
    const numericValues = usable
      .filter((value) => classifyValue(value) === "numeric")
      .map(Number)
      .filter(Number.isFinite);

    if (!numericValues.length) {
      throw new Error(`${method} requires valid numeric values`);
    }

    return method === "mean"
      ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
      : median(numericValues);
  }

  throw new Error(`Unsupported replacement method: ${method}`);
};

const isValidForType = (value, expectedType) =>
  isMissing(value) || classifyValue(value) === expectedType;

const validateStrategy = (strategy, column, allowedMethods) => {
  if (
    !strategy ||
    typeof strategy !== "object" ||
    !allowedMethods.includes(strategy.method)
  ) {
    throw new Error(`Invalid strategy for column "${column}"`);
  }

  if (
    strategy.method === "custom" &&
    (strategy.value === undefined ||
      strategy.value === null ||
      String(strategy.value).trim() === "")
  ) {
    throw new Error(`Provide a custom replacement value for "${column}"`);
  }

  if (
    strategy.excludedRows !== undefined &&
    (!Array.isArray(strategy.excludedRows) ||
      strategy.excludedRows.some((row) => !Number.isInteger(Number(row)) || Number(row) < 2))
  ) {
    throw new Error(`Invalid excluded row list for "${column}"`);
  }
};

const validateStrategyColumns = (strategies, columns, allowedMethods) => {
  for (const [column, strategy] of Object.entries(strategies || {})) {
    if (!columns.includes(column)) {
      throw new Error(`Unknown column: ${column}`);
    }
    validateStrategy(strategy, column, allowedMethods);
  }
};

const createOriginalVersionIfMissing = async (dataset) => {
  const original = await DatasetVersion.findOne({
    dataset: dataset._id,
    owner: dataset.owner,
    $or: [{ isOriginal: true }, { versionNumber: 1 }]
  });

  if (original) return original;

  const profiling = profileDataset(dataset.records, dataset.columns);

  return DatasetVersion.create({
    dataset: dataset._id,
    owner: dataset.owner,
    versionNumber: 1,
    records: dataset.records,
    columns: dataset.columns,
    originalColumns: dataset.originalColumns || dataset.columns,
    archivedColumns: dataset.archivedColumns || [],
    rowCount: dataset.records.length,
    columnCount: dataset.columns.length,
    profile: profiling.columns,
    qualityScore: profiling.qualityScore,
    qualityMetrics: profiling.qualityMetrics,
    mlReadiness: profiling.mlReadiness,
    issueSummary: profiling.issueSummary,
    outlierSummary: profiling.outlierSummary,
    correctionOpportunities: profiling.correctionOpportunities,
    isOriginal: true,
    changeSummary: {
      operation: "initial",
      description: "Original dataset snapshot"
    }
  });
};

const applyProfilingToDataset = (dataset, records) => {
  const profiling = profileDataset(records, dataset.columns);

  dataset.records = records;
  dataset.rowCount = records.length;
  dataset.columnCount = dataset.columns.length;
  dataset.profile = profiling.columns;
  dataset.qualityScore = profiling.qualityScore;
  dataset.qualityMetrics = profiling.qualityMetrics;
  dataset.issueSummary = profiling.issueSummary;
  dataset.outlierSummary = profiling.outlierSummary;
  dataset.mlReadiness = profiling.mlReadiness;
  dataset.correctionOpportunities = profiling.correctionOpportunities;
  dataset.lastAnalysisAt = profiling.analysedAt;
  dataset.status = "cleaned";

  return profiling;
};

const createVersionSnapshot = async (
  dataset,
  previousQualityScore,
  previousMlReadinessScore,
  changeSummary
) => {
  const latest = await DatasetVersion.findOne({
    dataset: dataset._id,
    owner: dataset.owner
  }).sort({ versionNumber: -1 });

  const versionNumber = latest ? latest.versionNumber + 1 : 1;

  return DatasetVersion.create({
    dataset: dataset._id,
    owner: dataset.owner,
    versionNumber,
    records: dataset.records,
    columns: dataset.columns,
    originalColumns: dataset.originalColumns || dataset.columns,
    archivedColumns: dataset.archivedColumns || [],
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    profile: dataset.profile,
    qualityScore: dataset.qualityScore,
    previousQualityScore,
    qualityMetrics: dataset.qualityMetrics,
    mlReadiness: dataset.mlReadiness,
    previousMlReadinessScore,
    issueSummary: dataset.issueSummary,
    outlierSummary: dataset.outlierSummary,
    correctionOpportunities: dataset.correctionOpportunities,
    changeSummary,
    isOriginal: false
  });
};

// --------------------------------------------------
// CLEANING PREVIEW
// --------------------------------------------------

const previewCleaning = async (req, res) => {
  try {
    const dataset = await findDataset(req.params.id, req.user._id);

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const records = dataset.records;
    const columns = dataset.columns;

    const missingCells = [];
    const missingColumns = [];
    const schemaColumns = [];
    const outlierColumns = [];
    const seenRows = new Set();
    const duplicateRows = [];

    columns.forEach((column) => {
      const values = records.map((record) => record[column]);
      const nonMissing = values.filter((value) => !isMissing(value));
      const missingCount = values.length - nonMissing.length;

      const profile = dataset.profile?.find(
        (item) => item.column === column
      );

      if (missingCount > 0) {
        const inferredType = profile?.inferredType || "categorical";

        const availableStrategies = [
          { value: "custom", label: "Custom value" },
          { value: "keep", label: "Keep unchanged" },
          { value: "drop_rows", label: "Remove affected rows" }
        ];

        if (inferredType === "numeric") {
          availableStrategies.unshift(
            { value: "mean", label: "Mean" },
            { value: "median", label: "Median" },
            { value: "mode", label: "Mode" }
          );
        } else {
          availableStrategies.unshift({
            value: "mode",
            label: "Most frequent value (mode)"
          });
        }

        missingColumns.push({
          column,
          inferredType,
          missingCount,
          missingPercentage: round(
            (missingCount / Math.max(records.length, 1)) * 100
          ),
          suggestedMethod: inferredType === "numeric" ? "median" : "mode",
          availableStrategies
        });
      }

      if (
        profile?.schemaValidation?.status === "mismatch" ||
        profile?.inferredType === "mixed"
      ) {
        schemaColumns.push({
          column,
          inferredType: profile.inferredType,
          mismatchCount: profile.schemaValidation?.mismatchCount || 0,
          mismatches: profile.schemaValidation?.mismatches || []
        });
      }

      const outlierDetection = profile?.outlierDetection;

      if (outlierDetection?.outlierCount > 0) {
        outlierColumns.push({
          column,
          outlierCount: outlierDetection.outlierCount,
          outlierPercentage: outlierDetection.outlierPercentage,
          lowerBound: outlierDetection.lowerBound,
          upperBound: outlierDetection.upperBound,
          outliers: outlierDetection.outliers || [],
          suggestedMethod: "median",
          availableStrategies: [
            { value: "mean", label: "Replace with mean" },
            { value: "median", label: "Replace with median" },
            { value: "mode", label: "Replace with mode" },
            { value: "custom", label: "Custom value" },
            { value: "drop_rows", label: "Remove affected rows" },
            { value: "keep", label: "Keep unchanged" }
          ]
        });
      }

      values.forEach((value, index) => {
        if (isMissing(value)) {
          missingCells.push({ row: index + 2, column });
        }
      });
    });

    records.forEach((record, index) => {
      const key = JSON.stringify(
        columns.map((column) => record[column] ?? null)
      );

      if (seenRows.has(key)) {
        duplicateRows.push(index + 2);
      } else {
        seenRows.add(key);
      }
    });

    return res.status(200).json({
      success: true,
      message: "Cleaning preview generated",
      preview: {
        datasetId: dataset._id,
        datasetName: dataset.name,
        totalRows: records.length,
        totalColumns: columns.length,
        missingCells,
        missingColumns,
        schemaColumns,
        outlierColumns,
        duplicateRows,
        missingValuesFound: missingCells.length,
        duplicateRowsFound: duplicateRows.length,
        totalOutliers: outlierColumns.reduce(
          (total, item) => total + item.outlierCount,
          0
        ),
        currentQualityScore: dataset.qualityScore,
        currentMlReadiness: dataset.mlReadiness,
        currentQualityMetrics: dataset.qualityMetrics
      }
    });
  } catch (error) {
    console.error("Cleaning preview error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate cleaning preview"
    });
  }
};
// --------------------------------------------------
// APPLY CLEANING
// --------------------------------------------------

const applyCleaning = async (req, res) => {
  try {
    const {
      columnStrategies = {},
      invalidStrategies = {},
      outlierStrategies = {},
      removeDuplicates = true
    } = req.body;

    const strategyGroups = [
      columnStrategies,
      invalidStrategies,
      outlierStrategies
    ];

    for (const strategies of strategyGroups) {
      if (
        !strategies ||
        typeof strategies !== "object" ||
        Array.isArray(strategies)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid cleaning strategy configuration"
        });
      }
    }

    const dataset = await findDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const columns = [...dataset.columns];
    const originalRecords = dataset.records.map(record => ({ ...record }));

    const replacementMethods = [
      "mean",
      "median",
      "mode",
      "custom"
    ];

    const allowedMethods = [
      ...replacementMethods,
      "keep",
      "drop_rows"
    ];

    // Validate all strategies.
    try {
      validateStrategyColumns(
        columnStrategies,
        columns,
        allowedMethods
      );

      validateStrategyColumns(
        invalidStrategies,
        columns,
        allowedMethods
      );

      validateStrategyColumns(
        outlierStrategies,
        columns,
        allowedMethods
      );

      for (const [column, strategy] of Object.entries(invalidStrategies)) {
        if (
          !["numeric", "categorical", "boolean", "date"].includes(
            strategy.expectedType
          )
        ) {
          throw new Error(
            `Provide a valid expectedType for invalid values in "${column}"`
          );
        }
      }

      for (const [column, strategy] of Object.entries(outlierStrategies)) {
        for (const key of ["lowerBound", "upperBound"]) {
          const value = strategy[key];

          if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            !Number.isFinite(Number(value))
          ) {
            throw new Error(
              `Invalid ${key} for outlier column "${column}"`
            );
          }
        }

        if (
          strategy.lowerBound !== undefined &&
          strategy.lowerBound !== null &&
          strategy.lowerBound !== "" &&
          strategy.upperBound !== undefined &&
          strategy.upperBound !== null &&
          strategy.upperBound !== "" &&
          Number(strategy.lowerBound) > Number(strategy.upperBound)
        ) {
          throw new Error(
            `Lower constraint cannot exceed upper constraint for "${column}"`
          );
        }
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    const getExcludedRows = (strategy) =>
      new Set((strategy.excludedRows || []).map(Number));

    const missingReplacements = {};
    const invalidReplacements = {};
    const outlierReplacements = {};

    // Calculate replacement values before modifying records.
    try {
      for (const [column, strategy] of Object.entries(columnStrategies)) {
        if (replacementMethods.includes(strategy.method)) {
          missingReplacements[column] = calculateReplacement(
            originalRecords.map(record => record[column]),
            strategy.method,
            strategy.value
          );
        }
      }

      for (const [column, strategy] of Object.entries(invalidStrategies)) {
        if (replacementMethods.includes(strategy.method)) {
          const validValues = originalRecords
            .map(record => record[column])
            .filter(value =>
              !isMissing(value) &&
              isValidForType(value, strategy.expectedType)
            );

          invalidReplacements[column] = calculateReplacement(
            validValues,
            strategy.method,
            strategy.value
          );
        }
      }

      for (const [column, strategy] of Object.entries(outlierStrategies)) {
        if (replacementMethods.includes(strategy.method)) {
          const numericValues = originalRecords
            .map(record => record[column])
            .filter(value =>
              !isMissing(value) &&
              classifyValue(value) === "numeric"
            );

          outlierReplacements[column] = calculateReplacement(
            numericValues,
            strategy.method,
            strategy.value
          );
        }
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Detect outlier rows using either custom constraints
    // or the profiling service's IQR detection.
    const originalProfile = profileDataset(
      originalRecords,
      columns
    );

    const outlierRowsByColumn = {};

    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      const profileColumn = originalProfile.columns.find(
        item => item.column === column
      );

      const detectedOutliers =
        profileColumn?.outlierDetection?.outliers || [];

      const lowerBound =
        strategy.lowerBound === undefined ||
        strategy.lowerBound === null ||
        strategy.lowerBound === ""
          ? null
          : Number(strategy.lowerBound);

      const upperBound =
        strategy.upperBound === undefined ||
        strategy.upperBound === null ||
        strategy.upperBound === ""
          ? null
          : Number(strategy.upperBound);

      const customConstraints =
        lowerBound !== null || upperBound !== null;

      outlierRowsByColumn[column] = new Set();

      originalRecords.forEach((record, index) => {
        const rawValue = record[column];

        if (
          isMissing(rawValue) ||
          classifyValue(rawValue) !== "numeric"
        ) {
          return;
        }

        const value = Number(rawValue);

        const isOutlier = customConstraints
          ? (
              (lowerBound !== null && value < lowerBound) ||
              (upperBound !== null && value > upperBound)
            )
          : detectedOutliers.some(
              item => item.row === index + 2
            );

        if (isOutlier) {
          outlierRowsByColumn[column].add(index);
        }
      });
    }

    // Determine which rows must be removed.
    // Row numbers include the CSV header, so first data row = 2.
    const rowsToRemove = new Set();

    for (const [column, strategy] of Object.entries(columnStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      const excluded = getExcludedRows(strategy);

      originalRecords.forEach((record, index) => {
        const rowNumber = index + 2;

        if (
          !excluded.has(rowNumber) &&
          isMissing(record[column])
        ) {
          rowsToRemove.add(index);
        }
      });
    }

    for (const [column, strategy] of Object.entries(invalidStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      const excluded = getExcludedRows(strategy);

      originalRecords.forEach((record, index) => {
        const rowNumber = index + 2;

        if (
          !excluded.has(rowNumber) &&
          !isMissing(record[column]) &&
          !isValidForType(record[column], strategy.expectedType)
        ) {
          rowsToRemove.add(index);
        }
      });
    }

    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      const excluded = getExcludedRows(strategy);

      outlierRowsByColumn[column].forEach(index => {
        if (!excluded.has(index + 2)) {
          rowsToRemove.add(index);
        }
      });
    }

    let missingValuesFilled = 0;
    let invalidValuesReplaced = 0;
    let outliersReplaced = 0;

    // Keep original row indexes so exclusions remain accurate
    // even when other rows are removed.
    const indexedRecords = originalRecords
      .map((record, index) => ({
        record: { ...record },
        originalIndex: index
      }))
      .filter(item => !rowsToRemove.has(item.originalIndex));

    // Apply missing-value and invalid-value treatments.
    indexedRecords.forEach(item => {
      const rowNumber = item.originalIndex + 2;
      const record = item.record;

      for (const [column, strategy] of Object.entries(columnStrategies)) {
        if (
          strategy.method === "keep" ||
          strategy.method === "drop_rows"
        ) {
          continue;
        }

        const excluded = getExcludedRows(strategy);

        if (
          isMissing(record[column]) &&
          !excluded.has(rowNumber)
        ) {
          record[column] = missingReplacements[column];
          missingValuesFilled++;
        }
      }

      for (const [column, strategy] of Object.entries(invalidStrategies)) {
        if (
          strategy.method === "keep" ||
          strategy.method === "drop_rows"
        ) {
          continue;
        }

        const excluded = getExcludedRows(strategy);

        if (
          !excluded.has(rowNumber) &&
          !isMissing(record[column]) &&
          !isValidForType(record[column], strategy.expectedType)
        ) {
          record[column] = invalidReplacements[column];
          invalidValuesReplaced++;
        }
      }
    });

    // Apply outlier treatments independently per column.
    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      if (!replacementMethods.includes(strategy.method)) {
        continue;
      }

      const excluded = getExcludedRows(strategy);
      const outlierIndexes = outlierRowsByColumn[column];

      indexedRecords.forEach(item => {
        const rowNumber = item.originalIndex + 2;

        if (
          !outlierIndexes.has(item.originalIndex) ||
          excluded.has(rowNumber)
        ) {
          return;
        }

        item.record[column] = outlierReplacements[column];
        outliersReplaced++;
      });
    }

    let processedRecords = indexedRecords.map(
      item => item.record
    );

    // Remove duplicate rows if requested.
    let duplicateRowsRemoved = 0;

    if (removeDuplicates !== false) {
      const seen = new Set();

      processedRecords = processedRecords.filter(record => {
        const key = JSON.stringify(
          columns.map(column => record[column] ?? null)
        );

        if (seen.has(key)) {
          duplicateRowsRemoved++;
          return false;
        }

        seen.add(key);
        return true;
      });
    }

    const rowsRemoved = rowsToRemove.size;

    if (
      missingValuesFilled === 0 &&
      invalidValuesReplaced === 0 &&
      outliersReplaced === 0 &&
      duplicateRowsRemoved === 0 &&
      rowsRemoved === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "No changes were made. Check the selected strategies and excluded rows."
      });
    }

    const previousQualityScore = dataset.qualityScore;
    const previousMlReadinessScore =
      dataset.mlReadiness?.score ?? null;

    // Preserve the pre-cleaning state before changing the dataset.
    await createOriginalVersionIfMissing(dataset);

    applyProfilingToDataset(dataset, processedRecords);

    const strategySummary = [
      ...Object.entries(columnStrategies).map(([column, strategy]) => ({
        column,
        target: "missing",
        method: strategy.method,
        excludedRows: strategy.excludedRows || []
      })),

      ...Object.entries(invalidStrategies).map(([column, strategy]) => ({
        column,
        target: "invalid",
        expectedType: strategy.expectedType,
        method: strategy.method,
        excludedRows: strategy.excludedRows || []
      })),

      ...Object.entries(outlierStrategies).map(([column, strategy]) => ({
        column,
        target: "outlier",
        method: strategy.method,
        lowerBound: strategy.lowerBound ?? null,
        upperBound: strategy.upperBound ?? null,
        excludedRows: strategy.excludedRows || []
      }))
    ];

    const newVersion = await createVersionSnapshot(
      dataset,
      previousQualityScore,
      previousMlReadinessScore,
      {
        operation: "data_cleaning",
        description: "Missing values, invalid values and outliers processed",
        missingValuesFilled,
        invalidValuesReplaced,
        outliersReplaced,
        duplicateRowsRemoved,
        rowsRemoved,
        columnsModified: strategySummary.length,
        columnStrategies: strategySummary
      }
    );

    await dataset.save();

    return res.status(201).json({
      success: true,
      message: "Cleaning applied and new dataset version created",

      version: {
        id: newVersion._id,
        versionNumber: newVersion.versionNumber,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        qualityScore: dataset.qualityScore,
        previousQualityScore,
        qualityMetrics: dataset.qualityMetrics,
        mlReadiness: dataset.mlReadiness,
        outlierSummary: dataset.outlierSummary,
        changeSummary: newVersion.changeSummary,
        createdAt: newVersion.createdAt
      },

      dataset: {
        id: dataset._id,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        qualityScore: dataset.qualityScore,
        qualityMetrics: dataset.qualityMetrics,
        mlReadiness: dataset.mlReadiness,
        issueSummary: dataset.issueSummary,
        outlierSummary: dataset.outlierSummary
      }
    });
  } catch (error) {
    console.error("Apply cleaning error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to apply cleaning"
    });
  }
};

// --------------------------------------------------
// EXPORT CURRENT OR HISTORICAL DATASET
// --------------------------------------------------

const exportDataset = async (req, res) => {
  try {
    const { version } = req.query;

    const dataset = await findDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    let records = dataset.records;
    let columns = dataset.columns;
    let filename = `${dataset.name}-current.csv`;

    if (version !== undefined) {
      const versionNumber = Number(version);

      if (!Number.isInteger(versionNumber) || versionNumber < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid version number"
        });
      }

      const datasetVersion = await DatasetVersion.findOne({
        dataset: dataset._id,
        owner: req.user._id,
        versionNumber
      }).select("+records");

      if (!datasetVersion) {
        return res.status(404).json({
          success: false,
          message: "Dataset version not found"
        });
      }

      records = datasetVersion.records;
      columns = datasetVersion.columns?.length
        ? datasetVersion.columns
        : dataset.columns;

      filename = `${dataset.name}-version-${versionNumber}.csv`;
    }

    // Protect exported CSV files against formula injection.
    const safeRecords = records.map(record => {
      const safeRecord = {};

      for (const column of columns) {
        const value = record[column];

        safeRecord[column] =
          typeof value === "string" &&
          /^[\s]*[=+\-@]/.test(value)
            ? `'${value}`
            : value;
      }

      return safeRecord;
    });

    const csv = Papa.unparse(safeRecords, { columns });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    return res.status(200).send(csv);
  } catch (error) {
    console.error("Dataset export error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to export dataset"
    });
  }
};


// --------------------------------------------------
// GET VERSION HISTORY
// --------------------------------------------------

const getDatasetVersions = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).select("_id name");

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const versions = await DatasetVersion.find({
      dataset: dataset._id,
      owner: req.user._id
    })
      .select("-records")
      .sort({ versionNumber: 1 });

    return res.status(200).json({
      success: true,

      dataset: {
        id: dataset._id,
        name: dataset.name
      },

      count: versions.length,

      versions: versions.map(version => ({
        id: version._id,
        versionNumber: version.versionNumber,

        label: version.isOriginal
          ? "Original"
          : `Version ${version.versionNumber}`,

        isOriginal: version.isOriginal,
        rowCount: version.rowCount,
        columnCount: version.columnCount,
        columns: version.columns,

        qualityScore: version.qualityScore,
        previousQualityScore: version.previousQualityScore,
        qualityMetrics: version.qualityMetrics,
        mlReadiness: version.mlReadiness,

        issueSummary: version.issueSummary,
        outlierSummary: version.outlierSummary,
        changeSummary: version.changeSummary,

        createdAt: version.createdAt
      }))
    });
  } catch (error) {
    console.error("Version history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve dataset versions"
    });
  }
};


// --------------------------------------------------
// DELETE A VERSION (EXCEPT ORIGINAL)
// --------------------------------------------------

const deleteDatasetVersion = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const version = await DatasetVersion.findOne({
      _id: req.params.versionId,
      dataset: dataset._id,
      owner: req.user._id
    });

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Dataset version not found"
      });
    }

    if (version.isOriginal || version.versionNumber === 1) {
      return res.status(400).json({
        success: false,
        message: "The original dataset version cannot be deleted"
      });
    }

    await DatasetVersion.deleteOne({
      _id: version._id
    });

    // Temporarily use negative version numbers to avoid
    // collisions with the unique version-number index.
    const remaining = await DatasetVersion.find({
      dataset: dataset._id,
      owner: req.user._id
    }).sort({ versionNumber: 1 });

    for (let index = 0; index < remaining.length; index++) {
      await DatasetVersion.updateOne(
        { _id: remaining[index]._id },
        { $set: { versionNumber: -(index + 1) } }
      );
    }

    // Restore sequential positive version numbers.
    for (let index = 0; index < remaining.length; index++) {
      await DatasetVersion.updateOne(
        { _id: remaining[index]._id },
        { $set: { versionNumber: index + 1 } }
      );
    }

    // Restore the dataset from the latest remaining version.
    const latestVersion = await DatasetVersion.findOne({
      dataset: dataset._id,
      owner: req.user._id
    })
      .sort({ versionNumber: -1 })
      .select("+records");

    if (latestVersion) {
      dataset.records = latestVersion.records;

      dataset.columns = latestVersion.columns?.length
        ? latestVersion.columns
        : dataset.columns;

      dataset.originalColumns =
        latestVersion.originalColumns || dataset.originalColumns;

      dataset.archivedColumns =
        latestVersion.archivedColumns || [];

      dataset.rowCount = latestVersion.rowCount;
      dataset.columnCount = latestVersion.columnCount;
      dataset.profile = latestVersion.profile || [];

      dataset.qualityScore = latestVersion.qualityScore;
      dataset.qualityMetrics = latestVersion.qualityMetrics;
      dataset.mlReadiness = latestVersion.mlReadiness;

      dataset.issueSummary = latestVersion.issueSummary;
      dataset.outlierSummary = latestVersion.outlierSummary;

      dataset.correctionOpportunities =
        latestVersion.correctionOpportunities;

      dataset.status = latestVersion.isOriginal
        ? "analysed"
        : "cleaned";

      await dataset.save();
    }

    return res.status(200).json({
      success: true,
      message: "Version deleted and history renumbered successfully",
      deletedVersionId: version._id,
      remainingVersions: remaining.length
    });
  } catch (error) {
    console.error("Version deletion error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete dataset version"
    });
  }
};


// --------------------------------------------------
// EXPORT CONTROLLERS
// --------------------------------------------------

module.exports = {
  previewCleaning,
  applyCleaning,
  exportDataset,
  getDatasetVersions,
  deleteDatasetVersion
};