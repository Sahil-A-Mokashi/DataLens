
const Dataset = require("../models/Dataset");
const DatasetVersion = require("../models/DatasetVersion");


const applyCleaning = async (req, res) => {
  try {
    const { missingValueReplacement } = req.body;

    if (
      typeof missingValueReplacement !== "string" ||
      missingValueReplacement.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a non-empty missingValueReplacement"
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
    const seenRows = new Set();

    let missingValuesFilled = 0;
    let duplicateRowsRemoved = 0;

    const cleanedRecords = [];

    for (const originalRecord of dataset.records) {
      const record = { ...originalRecord };

      // Fill missing values using the replacement supplied by the user.
      for (const column of columns) {
        const value = record[column];

        if (
          value === null ||
          value === undefined ||
          String(value).trim() === ""
        ) {
          record[column] = missingValueReplacement.trim();
          missingValuesFilled++;
        }
      }

      // Remove exact duplicate rows after filling missing values.
      const rowKey = JSON.stringify(
        columns.map(column => record[column])
      );

      if (seenRows.has(rowKey)) {
        duplicateRowsRemoved++;
        continue;
      }

      seenRows.add(rowKey);
      cleanedRecords.push(record);
    }

    const previousVersion = await DatasetVersion.findOne({
      dataset: dataset._id,
      owner: req.user._id
    }).sort({ versionNumber: -1 });

    const versionNumber = previousVersion
      ? previousVersion.versionNumber + 1
      : 2;

    const totalCells = cleanedRecords.length * columns.length;
    const remainingMissingValues = cleanedRecords.reduce(
      (total, record) =>
        total + columns.filter(column =>
          record[column] === null ||
          record[column] === undefined ||
          String(record[column]).trim() === ""
        ).length,
      0
    );

    const qualityScore = totalCells
      ? Number(
          ((1 - remainingMissingValues / totalCells) * 100).toFixed(2)
        )
      : 100;

    const newVersion = await DatasetVersion.create({
      dataset: dataset._id,
      owner: req.user._id,
      versionNumber,
      records: cleanedRecords,
      changeSummary: {
        missingValuesFilled,
        duplicateRowsRemoved
      },
      qualityScore
    });

    dataset.status = "cleaned";
    await dataset.save();

    res.status(201).json({
      success: true,
      message: "Cleaning applied and new version created",
      version: {
        id: newVersion._id,
        versionNumber: newVersion.versionNumber,
        rowCount: cleanedRecords.length,
        qualityScore: newVersion.qualityScore,
        changeSummary: newVersion.changeSummary,
        createdAt: newVersion.createdAt
      }
    });
  } catch (error) {
    console.error("Apply cleaning error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to apply cleaning"
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

    const records = dataset.records.map(record => ({
      ...record
    }));

    const columns = dataset.columns;
    const seenRows = new Set();
    const duplicateIndexes = [];
    const missingCells = [];

    records.forEach((record, rowIndex) => {
      columns.forEach(column => {
        const value = record[column];

        if (
          value === null ||
          value === undefined ||
          String(value).trim() === ""
        ) {
          missingCells.push({
            row: rowIndex + 1,
            column
          });
        }
      });

      const rowKey = JSON.stringify(
        columns.map(column => record[column])
      );

      if (seenRows.has(rowKey)) {
        duplicateIndexes.push(rowIndex);
      } else {
        seenRows.add(rowKey);
      }
    });

    res.status(200).json({
      success: true,
      message: "Cleaning preview generated",
      preview: {
        datasetId: dataset._id,
        datasetName: dataset.name,
        totalRows: records.length,
        missingCells,
        duplicateRows: duplicateIndexes.map(index => index + 1),
        missingValuesFound: missingCells.length,
        duplicateRowsFound: duplicateIndexes.length
      }
    });
  } catch (error) {
    console.error("Cleaning preview error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to generate cleaning preview"
    });
  }
};

module.exports = { previewCleaning, applyCleaning };
