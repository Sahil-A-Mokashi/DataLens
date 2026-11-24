
const {
  profileDataset,
  validateColumnSchema
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
    dataset: dataset._id
  }).sort({ versionNumber: -1 });

  const versionNumber = latest
    ? latest.versionNumber + 1
    : 1;

  const version = await DatasetVersion.create({
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

  return version;
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

// Safe arithmetic formula parser.
// Supported: column names, numbers, +, -, *, / and parentheses.
// Does not use eval() or execute JavaScript.
const evaluateFormula = (formula, record) => {
  if (typeof formula !== "string" || !formula.trim()) {
    throw new Error("A formula is required");
  }

  const tokens =
    formula.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[()+*/-]/g) || [];

  if (
    tokens.join("").replace(/\s/g, "") !==
    formula.replace(/\s/g, "")
  ) {
    throw new Error("Formula contains unsupported characters");
  }

  let position = 0;

  const parseExpression = () => {
    let value = parseTerm();

    while (tokens[position] === "+" || tokens[position] === "-") {
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

    while (tokens[position] === "*" || tokens[position] === "/") {
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
        throw new Error("Unmatched parentheses in formula");
      }

      return value;
    }

    if (token === "-") return -parseFactor();
    if (token === "+") return parseFactor();

    if (/^\d+(?:\.\d+)?$/.test(token)) {
      return Number(token);
    }

    if (!Object.prototype.hasOwnProperty.call(record, token)) {
      throw new Error(`Unknown column in formula: ${token}`);
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

      const csvContent = req.file.buffer.toString("utf8");

      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) =>
          typeof value === "string" ? value.trim() : value
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
          message: "The CSV file is empty or has no valid columns"
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
          message: "The CSV contains duplicate column names"
        });
      }

      const profiling = profileDataset(records, columns);

      createdDataset = await Dataset.create({
        owner: req.user._id,
        name: req.file.originalname.replace(/\.csv$/i, ""),
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

      // Preserve the original uploaded dataset as version 1.
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
          originalFilename: createdDataset.originalFilename,
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
          Dataset.deleteOne({ _id: createdDataset._id }),
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
// GET DATASETS
// --------------------------------------------------

exports.getDatasets = async (req, res) => {
  try {
    const datasets = await Dataset.find({
      owner: req.user._id
    })
      .select("-records")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: datasets.length,
      datasets
    });
  } catch (error) {
    console.error("Dataset retrieval error:", error.message);

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
    console.error("Dataset retrieval error:", error.message);

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
      message: "Dataset and its version history deleted successfully"
    });
  } catch (error) {
    console.error("Dataset deletion error:", error.message);

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

    const result = validateColumnSchema(
      dataset.records,
      dataset.columns,
      req.body.schema || {}
    );

    return res.status(200).json({
      success: true,
      validation: result
    });
  } catch (error) {
    console.error("Schema validation error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to validate dataset schema"
    });
  }
};

// --------------------------------------------------
// REMOVE COLUMN
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
      return res.status(404).json({
        success: false,
        message: "Column not found"
      });
    }

    if (dataset.columns.length <= 1) {
      return res.status(400).json({
        success: false,
        message: "A dataset must contain at least one column"
      });
    }

    const previousColumns = [...dataset.columns];

    dataset.columns = dataset.columns.filter(
      item => item !== column
    );

    dataset.archivedColumns = [
      ...(dataset.archivedColumns || []),
      {
        name: column,
        removedAt: new Date(),
        position: previousColumns.indexOf(column)
      }
    ];

    dataset.records = dataset.records.map(record => {
      const updated = { ...record };
      delete updated[column];
      return updated;
    });

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(dataset, {
      operation: "remove_column",
      description: `Removed column ${column}`,
      columnsRemoved: 1,
      structuralChanges: [
        {
          action: "remove",
          column
        }
      ]
    });

    return res.status(200).json({
      success: true,
      message: `Column "${column}" removed successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error("Remove column error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to remove column"
    });
  }
};

// --------------------------------------------------
// RESTORE COLUMN
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

    const archived = (dataset.archivedColumns || []).find(
      item => item.name === column
    );

    if (!archived) {
      return res.status(404).json({
        success: false,
        message: "Archived column not found"
      });
    }

    if (dataset.columns.includes(column)) {
      return res.status(400).json({
        success: false,
        message: "Column already exists"
      });
    }

    dataset.columns.splice(
      Math.min(archived.position ?? dataset.columns.length, dataset.columns.length),
      0,
      column
    );

    dataset.records = dataset.records.map(record => ({
      ...record,
      [column]: null
    }));

    dataset.archivedColumns = dataset.archivedColumns.filter(
      item => item.name !== column
    );

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(dataset, {
      operation: "restore_column",
      description: `Restored column ${column}`,
      columnsAdded: 1,
      structuralChanges: [
        {
          action: "restore",
          column
        }
      ]
    });

    return res.status(200).json({
      success: true,
      message: `Column "${column}" restored successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error("Restore column error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to restore column"
    });
  }
};

// --------------------------------------------------
// RENAME COLUMN
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

    const trimmedName = newName.trim();

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

    if (!dataset.columns.includes(oldName)) {
      return res.status(404).json({
        success: false,
        message: "Column not found"
      });
    }

    if (
      dataset.columns.includes(trimmedName) &&
      oldName !== trimmedName
    ) {
      return res.status(400).json({
        success: false,
        message: "A column with that name already exists"
      });
    }

    if (oldName === trimmedName) {
      return res.status(400).json({
        success: false,
        message: "The new name is the same as the old name"
      });
    }

    dataset.columns = dataset.columns.map(column =>
      column === oldName ? trimmedName : column
    );

    dataset.originalColumns = (
      dataset.originalColumns || []
    ).map(column =>
      column === oldName ? trimmedName : column
    );

    dataset.archivedColumns = (
      dataset.archivedColumns || []
    ).map(item => ({
      ...item.toObject?.() ?? item,
      name: item.name === oldName ? trimmedName : item.name
    }));

    dataset.records = dataset.records.map(record => {
      const updated = { ...record };
      updated[trimmedName] = updated[oldName];
      delete updated[oldName];
      return updated;
    });

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(dataset, {
      operation: "rename_column",
      description: `Renamed ${oldName} to ${trimmedName}`,
      structuralChanges: [
        {
          action: "rename",
          oldName,
          newName: trimmedName
        }
      ]
    });

    return res.status(200).json({
      success: true,
      message: `Column renamed to "${trimmedName}"`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error("Rename column error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to rename column"
    });
  }
};

// --------------------------------------------------
// RENAME MULTIPLE COLUMNS
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
        message: "Provide a valid column rename object"
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

    const updatedColumns = dataset.columns.map(column =>
      renames[column] ? String(renames[column]).trim() : column
    );

    if (updatedColumns.some(column => !validateColumnName(column))) {
      return res.status(400).json({
        success: false,
        message: "One or more column names are invalid"
      });
    }

    if (new Set(updatedColumns).size !== updatedColumns.length) {
      return res.status(400).json({
        success: false,
        message: "Column names must be unique"
      });
    }

    const structuralChanges = [];

    dataset.records = dataset.records.map(record => {
      const updated = {};

      dataset.columns.forEach(oldName => {
        const newName = renames[oldName]
          ? String(renames[oldName]).trim()
          : oldName;

        updated[newName] = record[oldName];

        if (newName !== oldName) {
          structuralChanges.push({
            action: "rename",
            oldName,
            newName
          });
        }
      });

      return updated;
    });

    dataset.originalColumns = (
      dataset.originalColumns || []
    ).map(column =>
      renames[column]
        ? String(renames[column]).trim()
        : column
    );

    dataset.columns = updatedColumns;

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(dataset, {
      operation: "rename_columns",
      description: "Renamed multiple columns",
      structuralChanges
    });

    return res.status(200).json({
      success: true,
      message: "Columns renamed successfully",
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error("Rename columns error:", error.message);

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
      columnName,
      type,
      value,
      formula
    } = req.body;

    if (!validateColumnName(columnName)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid column name"
      });
    }

    const trimmedName = columnName.trim();

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

    if (dataset.columns.includes(trimmedName)) {
      return res.status(400).json({
        success: false,
        message: "A column with that name already exists"
      });
    }

    let values = [];

    switch (type) {
      case "constant":
        values = dataset.records.map(() => value ?? null);
        break;

      case "empty":
        values = dataset.records.map(() => null);
        break;

      case "formula":
        if (typeof formula !== "string" || !formula.trim()) {
          return res.status(400).json({
            success: false,
            message: "Provide a valid formula"
          });
        }

        try {
          values = dataset.records.map((record) =>
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
          message: "Unsupported column creation type"
        });
    }

    dataset.records = dataset.records.map((record, index) => ({
      ...record,
      [trimmedName]: values[index]
    }));

    dataset.columns.push(trimmedName);

    await refreshDataset(dataset);

    const version = await createVersionSnapshot(dataset, {
      operation: "add_column",
      description: `Added column ${trimmedName}`,
      columnsAdded: 1,
      structuralChanges: [
        {
          action: "add",
          column: trimmedName,
          type
        }
      ]
    });

    return res.status(201).json({
      success: true,
      message: `Column "${trimmedName}" added successfully`,
      dataset,
      versionNumber: version.versionNumber
    });
  } catch (error) {
    console.error("Add column error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to add column"
    });
  }
};
