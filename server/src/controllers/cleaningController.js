
const Dataset = require("../models/Dataset");
const DatasetVersion = require("../models/DatasetVersion");
const Papa = require("papaparse");

const {
  profileDataset,
  validateColumnSchema,
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

const findDataset = async (id, owner) => {
  return Dataset.findOne({
    _id: id,
    owner
  }).select("+records");
};

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

  if (!usable.length) {
    throw new Error("No valid values available to calculate replacement");
  }

  if (method === "mode") {
    return getMode(usable.map((value) => String(value).trim()))?.value;
  }

  const numericValues = usable
    .map(Number)
    .filter(Number.isFinite);

  if (!numericValues.length || numericValues.length !== usable.length) {
    throw new Error(`${method} requires valid numeric values`);
  }

  if (method === "mean") {
    return (
      numericValues.reduce((sum, value) => sum + value, 0) /
      numericValues.length
    );
  }

  if (method === "median") {
    return median(numericValues);
  }

  throw new Error(`Unsupported replacement method: ${method}`);
};

const isValidForType = (value, expectedType) => {
  if (isMissing(value)) return true;

  return classifyValue(value) === expectedType;
};

const getNextVersionNumber = async (datasetId, owner) => {
  const latest = await DatasetVersion.findOne({
    dataset: datasetId,
    owner
  }).sort({ versionNumber: -1 });

  return latest ? latest.versionNumber + 1 : 2;
};

const createOriginalVersionIfMissing = async (dataset) => {
  const original = await DatasetVersion.findOne({
    dataset: dataset._id,
    owner: dataset.owner,
    $or: [
      { isOriginal: true },
      { versionNumber: 1 }
    ]
  });

  if (original) return original;

  // Compatibility for datasets uploaded before original
  // snapshots were introduced.
  const profiling = profileDataset(
    dataset.records,
    dataset.columns
  );

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
  dataset.correctionOpportunities =
    profiling.correctionOpportunities;
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
  const versionNumber = await getNextVersionNumber(
    dataset._id,
    dataset.owner
  );

  const version = await DatasetVersion.create({
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

  return version;
};

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
    (
      strategy.value === undefined ||
      strategy.value === null ||
      String(strategy.value).trim() === ""
    )
  ) {
    throw new Error(`Provide a custom replacement value for "${column}"`);
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

// --------------------------------------------------
// CLEANING PREVIEW
// --------------------------------------------------

const previewCleaning = async (req, res) => {
  try {
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

    const records = dataset.records;
    const columns = dataset.columns;

    const missingCells = [];
    const missingColumns = [];
    const schemaColumns = [];
    const outlierColumns = [];

    const duplicateIndexes = [];
    const seenRows = new Set();

    columns.forEach((column) => {
      const values = records.map((record) => record[column]);
      const nonMissing = values.filter((value) => !isMissing(value));

      const missingCount = values.length - nonMissing.length;

      if (missingCount > 0) {
        const profile = dataset.profile?.find(
          (item) => item.column === column
        );

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
        } else if (inferredType === "categorical") {
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
          suggestedMethod:
            inferredType === "numeric" ? "median" : "mode",
          availableStrategies
        });
      }

      // Schema mismatch analysis.
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

      // Outlier detection.
      const outlierDetection = profile?.outlierDetection;

      if (outlierDetection?.outlierCount > 0) {
        outlierColumns.push({
          column,
          outlierCount: outlierDetection.outlierCount,
          outlierPercentage: outlierDetection.outlierPercentage,
          lowerBound: outlierDetection.lowerBound,
          upperBound: outlierDetection.upperBound,
          outliers: outlierDetection.outliers,
          suggestedMethod: "median",
          availableStrategies: [
            { value: "mean", label: "Replace with mean" },
            { value: "median", label: "Replace with median" },
            { value: "mode", label: "Replace with mode" },
            { value: "custom", label: "Replace with custom value" },
            { value: "drop_rows", label: "Remove affected rows" },
            { value: "keep", label: "Keep outliers unchanged" }
          ]
        });
      }

      values.forEach((value, index) => {
        if (isMissing(value)) {
          missingCells.push({
            row: index + 2,
            column
          });
        }
      });
    });

    // Duplicate row detection.
    records.forEach((record, index) => {
      const rowKey = JSON.stringify(
        columns.map((column) => record[column] ?? null)
      );

      if (seenRows.has(rowKey)) {
        duplicateIndexes.push(index);
      } else {
        seenRows.add(rowKey);
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

        duplicateRows: duplicateIndexes.map((index) => index + 2),

        missingValuesFound: missingCells.length,
        duplicateRowsFound: duplicateIndexes.length,

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
    console.error("Cleaning preview error:", error.message);

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

    if (
      !columnStrategies ||
      typeof columnStrategies !== "object" ||
      Array.isArray(columnStrategies) ||
      !invalidStrategies ||
      typeof invalidStrategies !== "object" ||
      Array.isArray(invalidStrategies) ||
      !outlierStrategies ||
      typeof outlierStrategies !== "object" ||
      Array.isArray(outlierStrategies)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid cleaning strategy configuration"
      });
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
    const records = dataset.records.map((record) => ({ ...record }));

    const replacementMethods = [
      "mean",
      "median",
      "mode",
      "custom"
    ];

    const missingMethods = [
      ...replacementMethods,
      "keep",
      "drop_rows"
    ];

    const treatmentMethods = [
      ...replacementMethods,
      "keep",
      "drop_rows"
    ];

    try {
      validateStrategyColumns(
        columnStrategies,
        columns,
        missingMethods
      );

      validateStrategyColumns(
        invalidStrategies,
        columns,
        treatmentMethods
      );

      validateStrategyColumns(
        outlierStrategies,
        columns,
        treatmentMethods
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // ------------------------------------------------
    // PREPARE REPLACEMENT VALUES
    // ------------------------------------------------

    const missingReplacements = {};
    const invalidReplacements = {};
    const outlierReplacements = {};

    try {
      for (const [column, strategy] of Object.entries(columnStrategies)) {
        if (replacementMethods.includes(strategy.method)) {
          missingReplacements[column] = calculateReplacement(
            records.map((record) => record[column]),
            strategy.method,
            strategy.value
          );
        }
      }

      for (const [column, strategy] of Object.entries(invalidStrategies)) {
        if (replacementMethods.includes(strategy.method)) {
          const expectedType = strategy.expectedType;

          if (
            !["numeric", "categorical", "boolean", "date"].includes(expectedType)
          ) {
            throw new Error(
              `Provide an expectedType for invalid values in "${column}"`
            );
          }

          const validValues = records
            .map((record) => record[column])
            .filter((value) =>
              !isMissing(value) &&
              isValidForType(value, expectedType)
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
          const values = records
            .map((record) => record[column])
            .filter((value) =>
              !isMissing(value) &&
              classifyValue(value) === "numeric"
            );

          outlierReplacements[column] = calculateReplacement(
            values,
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

    // ------------------------------------------------
    // IDENTIFY ROWS TO REMOVE
    // ------------------------------------------------

    const rowsToRemove = new Set();

    // Missing-value row removal.
    for (const [column, strategy] of Object.entries(columnStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      records.forEach((record, index) => {
        if (isMissing(record[column])) {
          rowsToRemove.add(index);
        }
      });
    }

    // Invalid-value row removal.
    for (const [column, strategy] of Object.entries(invalidStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      records.forEach((record, index) => {
        if (
          !isMissing(record[column]) &&
          !isValidForType(record[column], strategy.expectedType)
        ) {
          rowsToRemove.add(index);
        }
      });
    }

    // Outlier row removal.
    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      if (strategy.method !== "drop_rows") continue;

      const profile = profileDataset(records, columns);
      const columnProfile = profile.columns.find(
        (item) => item.column === column
      );

      const outlierRows = new Set(
        (columnProfile?.outlierDetection?.outliers || [])
          .map((item) => item.row - 2)
      );

      outlierRows.forEach((index) => rowsToRemove.add(index));
    }

    // ------------------------------------------------
    // APPLY REPLACEMENTS
    // ------------------------------------------------

    let missingValuesFilled = 0;
    let invalidValuesReplaced = 0;
    let outliersReplaced = 0;

    const finalRecords = [];

    records.forEach((originalRecord, index) => {
      if (rowsToRemove.has(index)) return;

      const record = { ...originalRecord };

      // Missing values.
      for (const [column, strategy] of Object.entries(columnStrategies)) {
        if (
          !isMissing(record[column]) ||
          !replacementMethods.includes(strategy.method)
        ) {
          continue;
        }

        record[column] = missingReplacements[column];
        missingValuesFilled++;
      }

      // Invalid non-empty values.
      for (const [column, strategy] of Object.entries(invalidStrategies)) {
        if (
          isMissing(record[column]) ||
          !replacementMethods.includes(strategy.method) ||
          isValidForType(record[column], strategy.expectedType)
        ) {
          continue;
        }

        record[column] = invalidReplacements[column];
        invalidValuesReplaced++;
      }

      finalRecords.push(record);
    });

    // Outliers are processed after missing/invalid-value treatment.
    // Their row indexes are based on the original records.
    const outlierDropIndexes = new Set();

    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      if (strategy.method === "drop_rows") {
        const profile = profileDataset(records, columns);
        const columnProfile = profile.columns.find(
          (item) => item.column === column
        );

        (columnProfile?.outlierDetection?.outliers || []).forEach(
          (item) => outlierDropIndexes.add(item.row - 2)
        );
      }
    }

    let processedRecords = finalRecords;

    for (const [column, strategy] of Object.entries(outlierStrategies)) {
      if (!replacementMethods.includes(strategy.method)) continue;

      // Recalculate outlier indexes against the records that
      // remain after missing and invalid row removal.
      const currentProfile = profileDataset(processedRecords, columns);
      const columnProfile = currentProfile.columns.find(
        (item) => item.column === column
      );

      const outlierRows = new Set(
        (columnProfile?.outlierDetection?.outliers || [])
          .map((item) => item.row - 2)
      );

      processedRecords = processedRecords.map((record, index) => {
        if (!outlierRows.has(index)) return record;

        outliersReplaced++;

        return {
          ...record,
          [column]: outlierReplacements[column]
        };
      });
    }

    // ------------------------------------------------
    // DUPLICATE REMOVAL
    // ------------------------------------------------

    let duplicateRowsRemoved = 0;

    if (removeDuplicates !== false) {
      const seenRows = new Set();

      processedRecords = processedRecords.filter((record) => {
        const key = JSON.stringify(
          columns.map((column) => record[column] ?? null)
        );

        if (seenRows.has(key)) {
          duplicateRowsRemoved++;
          return false;
        }

        seenRows.add(key);
        return true;
      });
    }

    const rowsRemoved = records.length - finalRecords.length;

    if (
      !missingValuesFilled &&
      !invalidValuesReplaced &&
      !outliersReplaced &&
      !duplicateRowsRemoved &&
      !rowsRemoved
    ) {
      return res.status(400).json({
        success: false,
        message: "No changes were made. Check the selected strategies."
      });
    }

    // ------------------------------------------------
    // RECALCULATE PROFILING AND SCORES
    // ------------------------------------------------

    const previousQualityScore = dataset.qualityScore;
    const previousMlReadinessScore =
      dataset.mlReadiness?.score ?? null;

    const profiling = applyProfilingToDataset(
      dataset,
      processedRecords
    );

    // ------------------------------------------------
    // CREATE VERSION SNAPSHOT
    // ------------------------------------------------

    await createOriginalVersionIfMissing(dataset);

    const strategySummary = [
      ...Object.entries(columnStrategies).map(([column, strategy]) => ({
        column,
        target: "missing",
        method: strategy.method,
        ...(strategy.method === "custom"
          ? { value: strategy.value }
          : {}),
        ...(missingReplacements[column] !== undefined
          ? { replacementValue: missingReplacements[column] }
          : {})
      })),

      ...Object.entries(invalidStrategies).map(([column, strategy]) => ({
        column,
        target: "invalid",
        expectedType: strategy.expectedType,
        method: strategy.method,
        ...(strategy.method === "custom"
          ? { value: strategy.value }
          : {}),
        ...(invalidReplacements[column] !== undefined
          ? { replacementValue: invalidReplacements[column] }
          : {})
      })),

      ...Object.entries(outlierStrategies).map(([column, strategy]) => ({
        column,
        target: "outlier",
        method: strategy.method,
        ...(strategy.method === "custom"
          ? { value: strategy.value }
          : {}),
        ...(outlierReplacements[column] !== undefined
          ? { replacementValue: outlierReplacements[column] }
          : {})
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

    const safeRecords = records.map((record) => {
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
    console.error("Dataset export error:", error.message);

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
      versions: versions.map((version) => ({
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
    console.error("Version history error:", error.message);

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

    // Temporarily move remaining numbers to negative values
    // to avoid collisions with the unique version index.
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

    for (let index = 0; index < remaining.length; index++) {
      await DatasetVersion.updateOne(
        { _id: remaining[index]._id },
        { $set: { versionNumber: index + 1 } }
      );
    }

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
    console.error("Version deletion error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete dataset version"
    });
  }
};

module.exports = {
  previewCleaning,
  applyCleaning,
  exportDataset,
  getDatasetVersions,
  deleteDatasetVersion
};
