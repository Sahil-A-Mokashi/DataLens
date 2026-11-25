
const {
  profileDataset,
  classifyValue,
  isMissing
} = require("../services/profilingService");

const multer = require("multer");
const Papa = require("papaparse");
const mongoose = require("mongoose");

const Dataset = require("../models/Dataset");
const DatasetVersion = require("../models/DatasetVersion");

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return callback(new Error("Only CSV files are allowed"));
    }
    callback(null, true);
  }
});

// --------------------------------------------------
// SHARED HELPERS
// --------------------------------------------------

const round = (value) =>
  value === null || value === undefined
    ? null
    : Number(Number(value).toFixed(2));

const applyAssessment = (dataset, profiling) => {
  dataset.rowCount = profiling.rowCount;
  dataset.columnCount = profiling.columnCount;
  dataset.profile = profiling.columns;
  dataset.qualityScore = profiling.qualityScore;
  dataset.qualityMetrics = profiling.qualityMetrics;
  dataset.issueSummary = profiling.issueSummary;
  dataset.outlierSummary = profiling.outlierSummary;
  dataset.mlReadiness = profiling.mlReadiness;
  dataset.correctionOpportunities =
    profiling.correctionOpportunities;
  dataset.lastAnalysisAt = profiling.analysedAt;
  dataset.status = "analysed";
};

const createVersionSnapshot = async (
  dataset,
  changeSummary = {}
) => {
  const latest = await DatasetVersion.findOne({
    dataset: dataset._id,
    owner: dataset.owner
  }).sort({ versionNumber: -1 });

  const versionNumber = latest
    ? latest.versionNumber + 1
    : 1;

  return DatasetVersion.create({
    dataset: dataset._id,
    owner: dataset.owner,
    versionNumber,

    records: dataset.records,
    columns: dataset.columns,
    originalColumns: dataset.originalColumns,
    archivedColumns: dataset.archivedColumns,

    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,

    profile: dataset.profile,

    qualityScore: dataset.qualityScore,
    previousQualityScore:
      latest?.qualityScore ?? null,

    qualityMetrics: dataset.qualityMetrics,
    mlReadiness: dataset.mlReadiness,
    previousMlReadinessScore:
      latest?.mlReadiness?.score ?? null,

    issueSummary: dataset.issueSummary,
    outlierSummary: dataset.outlierSummary,
    correctionOpportunities:
      dataset.correctionOpportunities,

    changeSummary: {
      operation: changeSummary.operation || "structural_change",
      description:
        changeSummary.description || "Dataset structure updated",
      ...changeSummary
    },

    isOriginal: false
  });
};

const findOwnedDataset = async (id, owner) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  return Dataset.findOne({
    _id: id,
    owner
  }).select("+records");
};

const refreshDataset = async (dataset) => {
  const profiling = profileDataset(
    dataset.records,
    dataset.columns
  );

  applyAssessment(dataset, profiling);
  dataset.columnCount = dataset.columns.length;

  await dataset.save();

  return profiling;
};

const validateColumnName = (name) => {
  if (typeof name !== "string") return false;

  const trimmed = name.trim();

  return (
    trimmed.length > 0 &&
    trimmed.length <= 150 &&
    !trimmed.startsWith("__")
  );
};

// --------------------------------------------------
// SCHEMA VALIDATION HELPER
// --------------------------------------------------

const validateValuesAgainstType = (
  values,
  expectedType
) => {
  const mismatches = [];

  let validCount = 0;
  let missingCount = 0;

  values.forEach((value, index) => {
    if (isMissing(value)) {
      missingCount++;
      return;
    }

    const detectedType = classifyValue(value);
    const valid = detectedType === expectedType;

    if (valid) {
      validCount++;
    } else {
      mismatches.push({
        row: index + 2,
        value,
        detectedType
      });
    }
  });

  const checkedCount =
    validCount + mismatches.length;

  const mismatchCount = mismatches.length;

  return {
    expectedType,
    totalCount: values.length,
    checkedCount,
    missingCount,
    validCount,
    mismatchCount,

    mismatchPercentage: checkedCount
      ? round((mismatchCount / checkedCount) * 100)
      : 0,

    status:
      checkedCount === 0
        ? "empty"
        : mismatchCount === 0
          ? "valid"
          : "mismatch",

    mismatches
  };
};

// --------------------------------------------------
// SAFE FORMULA EVALUATOR
// --------------------------------------------------

const evaluateFormula = (formula, record) => {
  if (typeof formula !== "string" || !formula.trim()) {
    throw new Error("A formula is required");
  }

  const tokens =
    formula.match(
      /[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[()+*/-]/g
    ) || [];

  if (
    tokens.join("").replace(/\s/g, "") !==
    formula.replace(/\s/g, "")
  ) {
    throw new Error(
      "Formula contains unsupported characters"
    );
  }

  let position = 0;

  const parseExpression = () => {
    let value = parseTerm();

    while (
      tokens[position] === "+" ||
      tokens[position] === "-"
    ) {
      const operator = tokens[position++];
      const right = parseTerm();

      value =
        operator === "+"
          ? value + right
          : value - right;
    }

    return value;
  };

  const parseTerm = () => {
    let value = parseFactor();

    while (
      tokens[position] === "*" ||
      tokens[position] === "/"
    ) {
      const operator = tokens[position++];
      const right = parseFactor();

      if (operator === "/" && right === 0) {
        throw new Error("Division by zero in formula");
      }

      value =
        operator === "*"
          ? value * right
          : value / right;
    }

    return value;
  };

  const parseFactor = () => {
    const token = tokens[position++];

    if (token === undefined) {
      throw new Error("Incomplete formula");
    }

    if (token === "(") {
      const value = parseExpression();

      if (tokens[position++] !== ")") {
        throw new Error(
          "Unmatched parentheses in formula"
        );
      }

      return value;
    }

    if (token === "-") return -parseFactor();
    if (token === "+") return parseFactor();

    if (/^\d+(?:\.\d+)?$/.test(token)) {
      return Number(token);
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        record,
        token
      )
    ) {
      throw new Error(
        `Unknown column in formula: ${token}`
      );
    }

    const value = Number(record[token]);

    if (!Number.isFinite(value)) {
      throw new Error(
        `Column "${token}" contains a non-numeric value`
      );
    }

    return value;
  };

  const result = parseExpression();

  if (position !== tokens.length) {
    throw new Error("Invalid formula syntax");
  }

  if (!Number.isFinite(result)) {
    throw new Error("Formula produced an invalid number");
  }

  return result;
};

// --------------------------------------------------
// CSV UPLOAD
// --------------------------------------------------

exports.uploadCSV = [
  upload.single("file"),

  async (req, res) => {
    let createdDataset = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a CSV file"
        });
      }

      const csvContent =
        req.file.buffer.toString("utf8");

      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) =>
          typeof value === "string"
            ? value.trim()
            : value
      });

      if (parsed.errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "The CSV contains parsing errors",
          errors: parsed.errors.slice(0, 5)
        });
      }

      const columns = parsed.meta.fields || [];
      const records = parsed.data;

      if (!columns.length || !records.length) {
        return res.status(400).json({
          success: false,
          message:
            "The CSV file is empty or has no valid columns"
        });
      }

      if (columns.some((column) => !column)) {
        return res.status(400).json({
          success: false,
          message: "The CSV contains an empty column name"
        });
      }

      if (new Set(columns).size !== columns.length) {
        return res.status(400).json({
          success: false,
          message:
            "The CSV contains duplicate column names"
        });
      }

      const profiling = profileDataset(
        records,
        columns
      );

      createdDataset = await Dataset.create({
        owner: req.user._id,

        name: req.file.originalname.replace(
          /\.csv$/i,
          ""
        ),

        originalFilename: req.file.originalname,

        columns,
        originalColumns: [...columns],

        rowCount: records.length,
        columnCount: columns.length,

        records,

        qualityScore: profiling.qualityScore,
        qualityMetrics: profiling.qualityMetrics,
        issueSummary: profiling.issueSummary,
        outlierSummary: profiling.outlierSummary,
        mlReadiness: profiling.mlReadiness,

        correctionOpportunities:
          profiling.correctionOpportunities,

        profile: profiling.columns,
        lastAnalysisAt: profiling.analysedAt,

        status: "analysed"
      });

      await DatasetVersion.create({
        dataset: createdDataset._id,
        owner: req.user._id,
        versionNumber: 1,

        records,
        columns,
        originalColumns: [...columns],
        archivedColumns: [],

        rowCount: records.length,
        columnCount: columns.length,

        profile: profiling.columns,

        qualityScore: profiling.qualityScore,
        qualityMetrics: profiling.qualityMetrics,
        mlReadiness: profiling.mlReadiness,

        issueSummary: profiling.issueSummary,
        outlierSummary: profiling.outlierSummary,

        correctionOpportunities:
          profiling.correctionOpportunities,

        isOriginal: true,

        changeSummary: {
          operation: "initial",
          description: "Original CSV uploaded"
        }
      });

      return res.status(201).json({
        success: true,
        message: "CSV uploaded and analysed successfully",

        dataset: {
          id: createdDataset._id,
          name: createdDataset.name,
          originalFilename:
            createdDataset.originalFilename,

          columns: createdDataset.columns,

          rowCount: createdDataset.rowCount,
          columnCount: createdDataset.columnCount,

          qualityScore: createdDataset.qualityScore,
          qualityMetrics: createdDataset.qualityMetrics,

          issueSummary: createdDataset.issueSummary,
          outlierSummary: createdDataset.outlierSummary,

          mlReadiness: createdDataset.mlReadiness,

          correctionOpportunities:
            createdDataset.correctionOpportunities,

          status: createdDataset.status,
          profile: createdDataset.profile,

          lastAnalysisAt: createdDataset.lastAnalysisAt
        }
      });
    } catch (error) {
      console.error("CSV upload error:", error);

      if (createdDataset) {
        await Promise.all([
          Dataset.deleteOne({
            _id: createdDataset._id
          }),

          DatasetVersion.deleteMany({
            dataset: createdDataset._id
          })
        ]);
      }

      return res.status(500).json({
        success: false,
        message: "Unable to process the CSV file"
      });
    }
  }
];

// --------------------------------------------------
// GET DATASETS WITH PAGINATION AND DATE FILTERS
// --------------------------------------------------

exports.getDatasets = async (req, res) => {
  try {
    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(
        1,
        parseInt(req.query.limit, 10) || 10
      )
    );

    const dateField =
      req.query.dateField === "analysed"
        ? "lastAnalysisAt"
        : "createdAt";

    const sortOrder =
      req.query.sortOrder === "oldest" ? 1 : -1;

    const filter = {
      owner: req.user._id
    };

    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom)
      : null;

    const dateTo = req.query.dateTo
      ? new Date(req.query.dateTo)
      : null;

    if (
      dateFrom &&
      Number.isNaN(dateFrom.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid start date"
      });
    }

    if (
      dateTo &&
      Number.isNaN(dateTo.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid end date"
      });
    }

    if (dateFrom || dateTo) {
      filter[dateField] = {};

      if (dateFrom) {
        filter[dateField].$gte = dateFrom;
      }

      if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
        filter[dateField].$lte = dateTo;
      }
    }

    const total = await Dataset.countDocuments(filter);

    const datasets = await Dataset.find(filter)
      .select("-records")
      .sort({
        [dateField]: sortOrder,
        _id: sortOrder
      })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,

      count: datasets.length,
      datasets,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),

        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1
      },

      filters: {
        dateField:
          req.query.dateField === "analysed"
            ? "analysed"
            : "uploaded",

        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null,

        sortOrder:
          sortOrder === 1 ? "oldest" : "recent"
      }
    });
  } catch (error) {
    console.error(
      "Dataset retrieval error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve datasets"
    });
  }
};

// --------------------------------------------------
// GET ONE DATASET
// --------------------------------------------------

exports.getDatasetById = async (req, res) => {
  try {
    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    return res.status(200).json({
      success: true,
      dataset
    });
  } catch (error) {
    console.error(
      "Dataset retrieval error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message: "Invalid dataset ID"
    });
  }
};

// --------------------------------------------------
// DELETE DATASET AND ALL ITS VERSIONS
// --------------------------------------------------

exports.deleteDataset = async (req, res) => {
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

    await DatasetVersion.deleteMany({
      dataset: dataset._id,
      owner: req.user._id
    });

    await Dataset.deleteOne({
      _id: dataset._id,
      owner: req.user._id
    });

    return res.status(200).json({
      success: true,
      message:
        "Dataset and its version history deleted successfully"
    });
  } catch (error) {
    console.error(
      "Dataset deletion error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to delete dataset"
    });
  }
};

// --------------------------------------------------
// SCHEMA VALIDATION
// --------------------------------------------------

exports.validateDatasetSchema = async (req, res) => {
  try {
    const { column, expectedType } = req.body;

    const allowedTypes = [
      "numeric",
      "categorical",
      "boolean",
      "date"
    ];

    if (
      !column ||
      !allowedTypes.includes(expectedType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide a valid column and expected data type"
      });
    }

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    if (!dataset.columns.includes(column)) {
      return res.status(400).json({
        success: false,
        message:
          "The selected column does not exist in this dataset"
      });
    }

    const values = dataset.records.map(
      (record) => record[column]
    );

    const validation = validateValuesAgainstType(
      values,
      expectedType
    );

    return res.status(200).json({
      success: true,
      message: "Column schema validation completed",
      column,
      validation
    });
  } catch (error) {
    console.error(
      "Schema validation error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to validate column schema"
    });
  }
};

// --------------------------------------------------
// REMOVE COLUMN (ARCHIVE VALUES FOR RESTORATION)
// --------------------------------------------------

exports.removeColumn = async (req, res) => {
  try {
    const { column } = req.body;

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    if (!dataset.columns.includes(column)) {
      return res.status(400).json({
        success: false,
        message: "Column does not exist"
      });
    }

    if (dataset.columns.length <= 1) {
      return res.status(400).json({
        success: false,
        message:
          "A dataset must retain at least one column"
      });
    }

    const originalIndex =
      dataset.columns.indexOf(column);

    const values = dataset.records.map(
      (record) => record[column]
    );

    const profile = dataset.profile.find(
      (item) => item.column === column
    );

    dataset.archivedColumns.push({
      name: column,
      values,
      originalIndex,
      profile: profile || null,
      removedAt: new Date()
    });

    dataset.records = dataset.records.map((record) => {
      const updated = { ...record };
      delete updated[column];
      return updated;
    });

    dataset.columns = dataset.columns.filter(
      (item) => item !== column
    );

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(
      dataset,
      {
        operation: "remove_column",
        description: `Removed column ${column}`,
        columnsRemoved: 1,
        columnsModified: 1,

        structuralChanges: [
          { action: "remove", column }
        ]
      }
    );

    return res.status(200).json({
      success: true,
      message: `Column "${column}" archived successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error(
      "Column removal error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to remove column"
    });
  }
};

// --------------------------------------------------
// RESTORE ARCHIVED COLUMN
// --------------------------------------------------

exports.restoreColumn = async (req, res) => {
  try {
    const { column } = req.body;

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const archivedIndex =
      dataset.archivedColumns.findIndex(
        (item) => item.name === column
      );

    if (archivedIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Archived column not found"
      });
    }

    if (dataset.columns.includes(column)) {
      return res.status(400).json({
        success: false,
        message:
          "A column with this name already exists"
      });
    }

    const archived =
      dataset.archivedColumns[archivedIndex];

    if (
      !Array.isArray(archived.values) ||
      archived.values.length !== dataset.records.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Archived column values cannot be restored safely"
      });
    }

    dataset.records = dataset.records.map(
      (record, index) => ({
        ...record,
        [column]: archived.values[index]
      })
    );

    const insertAt = Math.max(
      0,
      Math.min(
        archived.originalIndex ?? dataset.columns.length,
        dataset.columns.length
      )
    );

    dataset.columns.splice(insertAt, 0, column);

    dataset.archivedColumns.splice(
      archivedIndex,
      1
    );

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(
      dataset,
      {
        operation: "restore_column",
        description: `Restored column ${column}`,
        columnsAdded: 1,

        structuralChanges: [
          { action: "restore", column }
        ]
      }
    );

    return res.status(200).json({
      success: true,
      message: `Column "${column}" restored successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error(
      "Column restoration error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to restore column"
    });
  }
};

// --------------------------------------------------
// RENAME ONE COLUMN
// --------------------------------------------------

exports.renameColumn = async (req, res) => {
  try {
    const { oldName, newName } = req.body;

    if (!validateColumnName(newName)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid new column name"
      });
    }

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const trimmedName = newName.trim();

    if (!dataset.columns.includes(oldName)) {
      return res.status(404).json({
        success: false,
        message: "Original column not found"
      });
    }

    if (
      oldName !== trimmedName &&
      (
        dataset.columns.includes(trimmedName) ||
        dataset.archivedColumns.some(
          (item) => item.name === trimmedName
        )
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A column with this name already exists"
      });
    }

    if (oldName === trimmedName) {
      return res.status(200).json({
        success: true,
        message: "Column name is unchanged"
      });
    }

    dataset.records = dataset.records.map((record) => {
      const updated = { ...record };

      updated[trimmedName] = updated[oldName];

      delete updated[oldName];

      return updated;
    });

    dataset.columns = dataset.columns.map(
      (column) =>
        column === oldName
          ? trimmedName
          : column
    );

    dataset.originalColumns = (
      dataset.originalColumns || []
    ).map(
      (column) =>
        column === oldName
          ? trimmedName
          : column
    );

    dataset.archivedColumns =
      dataset.archivedColumns.map(
        (item) =>
          item.name === oldName
            ? { ...item, name: trimmedName }
            : item
      );

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(
      dataset,
      {
        operation: "rename_column",
        description:
          `Renamed ${oldName} to ${trimmedName}`,
        columnsRenamed: 1,

        structuralChanges: [
          {
            action: "rename",
            oldName,
            newName: trimmedName
          }
        ]
      }
    );

    return res.status(200).json({
      success: true,
      message: "Column renamed successfully",
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error(
      "Column rename error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to rename column"
    });
  }
};

// --------------------------------------------------
// BULK RENAME COLUMNS
// --------------------------------------------------

exports.renameAllColumns = async (req, res) => {
  try {
    const { renames } = req.body;

    if (
      !renames ||
      typeof renames !== "object" ||
      Array.isArray(renames)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a column rename mapping"
      });
    }

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const newColumns = dataset.columns.map(
      (column) =>
        Object.prototype.hasOwnProperty.call(
          renames,
          column
        )
          ? String(renames[column]).trim()
          : column
    );

    if (
      newColumns.some(
        (column) => !validateColumnName(column)
      ) ||
      new Set(newColumns).size !== newColumns.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Column names must be non-empty and unique"
      });
    }

    const changed = dataset.columns.filter(
      (column, index) =>
        column !== newColumns[index]
    );

    if (!changed.length) {
      return res.status(200).json({
        success: true,
        message:
          "No column names needed changing"
      });
    }

    const renameMap = {};

    dataset.columns.forEach((column, index) => {
      renameMap[column] = newColumns[index];
    });

    dataset.records = dataset.records.map((record) => {
      const updated = {};

      dataset.columns.forEach((column) => {
        updated[renameMap[column]] = record[column];
      });

      return updated;
    });

    dataset.columns = newColumns;

    dataset.originalColumns = (
      dataset.originalColumns || []
    ).map(
      (column) => renameMap[column] || column
    );

    dataset.archivedColumns =
      dataset.archivedColumns.map((item) => ({
        ...item,
        name: renameMap[item.name] || item.name
      }));

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(
      dataset,
      {
        operation: "bulk_rename_columns",
        description:
          `Renamed ${changed.length} columns`,
        columnsRenamed: changed.length,

        structuralChanges: changed.map(
          (oldName) => ({
            action: "rename",
            oldName,
            newName: renameMap[oldName]
          })
        )
      }
    );

    return res.status(200).json({
      success: true,
      message: "Columns renamed successfully",
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error(
      "Bulk rename error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to rename columns"
    });
  }
};

// --------------------------------------------------
// ADD COLUMN
// --------------------------------------------------

exports.addColumn = async (req, res) => {
  try {
    const {
      name,
      type,
      value,
      start,
      step,
      startDate,
      interval,
      formula
    } = req.body;

    if (!validateColumnName(name)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid column name"
      });
    }

    const dataset = await findOwnedDataset(
      req.params.id,
      req.user._id
    );

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const columnName = name.trim();

    if (
      dataset.columns.includes(columnName) ||
      dataset.archivedColumns.some(
        (item) => item.name === columnName
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This column name is already in use"
      });
    }

    let values = [];

    switch (type) {
      case "fixed":
        values = dataset.records.map(
          () => value ?? ""
        );
        break;

      case "increment": {
        const first = Number(start ?? 1);
        const increment = Number(step ?? 1);

        if (
          !Number.isFinite(first) ||
          !Number.isFinite(increment)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Start and step must be valid numbers"
          });
        }

        values = dataset.records.map(
          (_, index) =>
            first + index * increment
        );

        break;
      }

      case "date_sequence": {
        const firstDate = new Date(startDate);

        const allowedIntervals = [
          "daily",
          "monthly",
          "yearly"
        ];

        if (
          Number.isNaN(firstDate.getTime()) ||
          !allowedIntervals.includes(interval)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Provide a valid start date and interval"
          });
        }

        values = dataset.records.map((_, index) => {
          const date = new Date(firstDate);

          if (interval === "daily") {
            date.setDate(date.getDate() + index);
          } else if (interval === "monthly") {
            date.setMonth(date.getMonth() + index);
          } else {
            date.setFullYear(
              date.getFullYear() + index
            );
          }

          return date.toISOString().slice(0, 10);
        });

        break;
      }

      case "formula":
        if (
          !formula ||
          typeof formula !== "string"
        ) {
          return res.status(400).json({
            success: false,
            message: "Provide a valid formula"
          });
        }

        try {
          values = dataset.records.map(
            (record) =>
              evaluateFormula(formula, record)
          );
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: error.message
          });
        }

        break;

      default:
        return res.status(400).json({
          success: false,
          message:
            "Unsupported column creation type"
        });
    }

    dataset.records = dataset.records.map(
      (record, index) => ({
        ...record,
        [columnName]: values[index]
      })
    );

    dataset.columns.push(columnName);

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(
      dataset,
      {
        operation: "add_column",
        description: `Added column ${columnName}`,
        columnsAdded: 1,

        structuralChanges: [
          {
            action: "add",
            column: columnName,
            type
          }
        ]
      }
    );

    return res.status(201).json({
      success: true,
      message:
        `Column "${columnName}" added successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error(
      "Add column error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to add column"
    });
  }
};
