
const Dataset = require("../models/Dataset");
const DatasetVersion = require("../models/DatasetVersion");
const Papa = require("papaparse");


const applyCleaning = async (req, res) => {
  try {
    const { columnStrategies } = req.body;

    if (
      !columnStrategies ||
      typeof columnStrategies !== "object" ||
      Array.isArray(columnStrategies)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide column-specific cleaning strategies"
      });
    }

    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).select("+records");

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const columns = dataset.columns;
    const records = dataset.records.map(record => ({ ...record }));

    const allowedMethods = [
      "mean",
      "median",
      "mode",
      "custom",
      "keep",
      "drop_rows"
    ];

    // Validate selected strategies.
    for (const [column, strategy] of Object.entries(columnStrategies)) {
      if (!columns.includes(column)) {
        return res.status(400).json({
          success: false,
          message: `Unknown column: ${column}`
        });
      }

      if (
        !strategy ||
        !allowedMethods.includes(strategy.method)
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid cleaning strategy for ${column}`
        });
      }

      if (
        strategy.method === "custom" &&
        (
          typeof strategy.value !== "string" ||
          strategy.value.trim() === ""
        )
      ) {
        return res.status(400).json({
          success: false,
          message: `Provide a custom replacement value for ${column}`
        });
      }
    }

    const isMissing = value =>
      value === null ||
      value === undefined ||
      String(value).trim() === "";

    const getMode = values => {
      const frequencies = new Map();

      values.forEach(value => {
        const key = String(value);
        frequencies.set(key, (frequencies.get(key) || 0) + 1);
      });

      let mode = null;
      let highestFrequency = 0;

      for (const [value, frequency] of frequencies.entries()) {
        if (frequency > highestFrequency) {
          mode = value;
          highestFrequency = frequency;
        }
      }

      return mode;
    };

    // Calculate replacement values for each selected column.
    const replacementValues = {};

    for (const [column, strategy] of Object.entries(columnStrategies)) {
      const method = strategy.method;

      if (["keep", "drop_rows"].includes(method)) {
        continue;
      }

      const values = records
        .map(record => record[column])
        .filter(value => !isMissing(value));

      if (method === "custom") {
        replacementValues[column] = strategy.value.trim();
        continue;
      }

      if (method === "mode") {
        if (!values.length) {
          return res.status(400).json({
            success: false,
            message: `Cannot calculate mode for empty column ${column}`
          });
        }

        replacementValues[column] = getMode(values);
        continue;
      }

      // Mean and median require numeric data.
      const numericValues = values.map(Number);

      if (
        !numericValues.length ||
        numericValues.some(value => !Number.isFinite(value))
      ) {
        return res.status(400).json({
          success: false,
          message: `${method} requires a column containing valid numeric values: ${column}`
        });
      }

      if (method === "mean") {
        const mean =
          numericValues.reduce((sum, value) => sum + value, 0) /
          numericValues.length;

        replacementValues[column] = mean;
      }

      if (method === "median") {
        const sorted = [...numericValues].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);

        replacementValues[column] =
          sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle];
      }
    }

    // Identify rows that should be removed.
    const dropColumns = Object.entries(columnStrategies)
      .filter(([, strategy]) => strategy.method === "drop_rows")
      .map(([column]) => column);

    let rowsRemoved = 0;
    let missingValuesFilled = 0;

    const cleanedRecords = [];

    for (const originalRecord of records) {
      const record = { ...originalRecord };

      const shouldRemove = dropColumns.some(column =>
        isMissing(record[column])
      );

      if (shouldRemove) {
        rowsRemoved++;
        continue;
      }

      // Apply the selected strategy to each column.
      for (const [column, strategy] of Object.entries(columnStrategies)) {
        if (!isMissing(record[column])) {
          continue;
        }

        if (strategy.method === "keep" || strategy.method === "drop_rows") {
          continue;
        }

        record[column] = replacementValues[column];
        missingValuesFilled++;
      }

      cleanedRecords.push(record);
    }

    // Retain the existing exact duplicate removal behaviour.
    const seenRows = new Set();
    const uniqueRecords = [];
    let duplicateRowsRemoved = 0;

    for (const record of cleanedRecords) {
      const rowKey = JSON.stringify(
        columns.map(column => record[column])
      );

      if (seenRows.has(rowKey)) {
        duplicateRowsRemoved++;
        continue;
      }

      seenRows.add(rowKey);
      uniqueRecords.push(record);
    }

    const finalRecords = uniqueRecords;

    // Calculate remaining missing values.
    const remainingMissingValues = finalRecords.reduce(
      (total, record) =>
        total + columns.filter(column => isMissing(record[column])).length,
      0
    );

    const totalCells = finalRecords.length * columns.length;

    const qualityScore = totalCells
      ? Number(
          ((1 - remainingMissingValues / totalCells) * 100).toFixed(2)
        )
      : 100;

    const previousVersion = await DatasetVersion.findOne({
      dataset: dataset._id,
      owner: req.user._id
    }).sort({ versionNumber: -1 });

    const versionNumber = previousVersion
      ? previousVersion.versionNumber + 1
      : 2;

    const strategySummary = Object.entries(columnStrategies).map(
      ([column, strategy]) => ({
        column,
        method: strategy.method,
        ...(strategy.method === "custom"
          ? { value: strategy.value.trim() }
          : {}),
        ...(strategy.method === "mean" || strategy.method === "median" || strategy.method === "mode"
          ? { replacementValue: replacementValues[column] }
          : {})
      })
    );

    const columnsModified = strategySummary.filter(
      strategy => strategy.method !== "keep" &&
        strategy.method !== "drop_rows"
    ).length;

    const newVersion = await DatasetVersion.create({
      dataset: dataset._id,
      owner: req.user._id,
      versionNumber,
      records: finalRecords,
      previousQualityScore: dataset.qualityScore,
      qualityScore,
      changeSummary: {
        missingValuesFilled,
        duplicateRowsRemoved,
        rowsRemoved,
        columnsModified,
        columnStrategies: strategySummary
      }
    });

    dataset.status = "cleaned";
    dataset.qualityScore = qualityScore;
    dataset.rowCount = finalRecords.length;

    await dataset.save();

    return res.status(201).json({
      success: true,
      message: "Column-specific cleaning applied and new version created",
      version: {
        id: newVersion._id,
        versionNumber: newVersion.versionNumber,
        rowCount: finalRecords.length,
        qualityScore,
        previousQualityScore: newVersion.previousQualityScore,
        changeSummary: newVersion.changeSummary,
        createdAt: newVersion.createdAt
      }
    });
  } catch (error) {
    console.error("Apply cleaning error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to apply cleaning"
    });
  }
};




const exportDataset = async (req, res) => {
  try {
    const { version } = req.query;

    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).select("+records");

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    let records = dataset.records;
    let filename = `${dataset.name}-original.csv`;

    // If a version number is supplied, export that cleaned version.
    if (version !== undefined) {
      const versionNumber = Number(version);

      if (!Number.isInteger(versionNumber) || versionNumber < 2) {
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
      filename = `${dataset.name}-version-${versionNumber}.csv`;
    }

    // Protect spreadsheet users from formula injection.
    const safeRecords = records.map(record => {
      const safeRecord = {};

      for (const column of dataset.columns) {
        const value = record[column];

        safeRecord[column] =
          typeof value === "string" &&
          /^[\s]*[=+\-@]/.test(value)
            ? `'${value}`
            : value;
      }

      return safeRecord;
    });

    const csv = Papa.unparse(safeRecords, {
      columns: dataset.columns
    });

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



const previewCleaning = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).select("+records");

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found"
      });
    }

    const records = dataset.records.map(record => ({ ...record }));
    const columns = dataset.columns;

    const isMissing = value =>
      value === null ||
      value === undefined ||
      String(value).trim() === "";

    const seenRows = new Set();
    const duplicateIndexes = [];
    const missingCells = [];
    const columnAnalysis = [];

    // Analyse missing values separately for every column.
    columns.forEach(column => {
      const values = records.map(record => record[column]);

      const nonMissing = values.filter(value => !isMissing(value));
      const missingCount = values.length - nonMissing.length;

      if (missingCount > 0) {
        const existingProfile = dataset.profile?.find(
          profile => profile.column === column
        );

        const inferredType =
          existingProfile?.inferredType ||
          (nonMissing.length > 0 &&
            nonMissing.every(value =>
              Number.isFinite(Number(value)) &&
              String(value).trim() !== ""
            )
              ? "numeric"
              : "categorical");

        const isEmailColumn = /email|e-mail/i.test(column);

        let suggestedMethod = "mode";

        if (inferredType === "numeric") {
          suggestedMethod = "median";
        } else if (isEmailColumn) {
          suggestedMethod = "keep";
        }

        const availableStrategies = [
          {
            value: "custom",
            label: "Enter a custom replacement value"
          },
          {
            value: "keep",
            label: "Leave missing values unchanged"
          },
          {
            value: "drop_rows",
            label: "Remove rows with missing values"
          }
        ];

        if (!isEmailColumn && inferredType === "numeric") {
          availableStrategies.unshift(
            { value: "mean", label: "Fill with mean" },
            { value: "median", label: "Fill with median" },
            { value: "mode", label: "Fill with mode (most frequent)" }
          );
        } else if (!isEmailColumn && inferredType === "categorical") {
          availableStrategies.unshift({
            value: "mode",
            label: "Fill with mode (most frequent)"
          });
        }

        columnAnalysis.push({
          column,
          inferredType,
          missingCount,
          missingPercentage: Number(
            ((missingCount / Math.max(records.length, 1)) * 100).toFixed(2)
          ),
          suggestedMethod,
          availableStrategies
        });
      }
    });

    // Retain individual missing-cell locations.
    records.forEach((record, rowIndex) => {
      columns.forEach(column => {
        if (isMissing(record[column])) {
          missingCells.push({
            row: rowIndex + 1,
            column
          });
        }
      });

      // Detect exact duplicate rows.
      const rowKey = JSON.stringify(
        columns.map(column => record[column])
      );

      if (seenRows.has(rowKey)) {
        duplicateIndexes.push(rowIndex);
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
        missingColumns: columnAnalysis,
        duplicateRows: duplicateIndexes.map(index => index + 1),
        missingValuesFound: missingCells.length,
        duplicateRowsFound: duplicateIndexes.length
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



const getDatasetVersions = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id
    }).select("_id name rowCount qualityScore issueSummary createdAt");

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
    .select("+records")
    .sort({ versionNumber: 1 });

    const history = [
      {
        versionNumber: 1,
        label: "Original",
        rowCount: dataset.rowCount,
        qualityScore: dataset.qualityScore,
        changeSummary: {
          missingValuesFilled: 0,
          duplicateRowsRemoved: 0
        },
        createdAt: dataset.createdAt
      },
      ...versions.map(version => ({
        id: version._id,
        versionNumber: version.versionNumber,
        label: `Version ${version.versionNumber}`,
        rowCount: version.records.length,
        qualityScore: version.qualityScore,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt
      }))
    ];

    return res.status(200).json({
      success: true,
      dataset: {
        id: dataset._id,
        name: dataset.name
      },
      count: history.length,
      versions: history
    });
  } catch (error) {
    console.error("Version history error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve dataset versions"
    });
  }
};


module.exports = {
  previewCleaning,
  applyCleaning,
  exportDataset,
  getDatasetVersions
};
