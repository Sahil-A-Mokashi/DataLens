

const { profileDataset } = require("../services/profilingService");
const multer = require("multer");
const Papa = require("papaparse");
const Dataset = require("../models/Dataset");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return callback(new Error("Only CSV files are allowed"));
    }

    callback(null, true);
  },
});

// Upload and analyse a CSV file
exports.uploadCSV = [
  upload.single("file"),

  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please select a CSV file",
        });
      }

      const csvContent = req.file.buffer.toString("utf8");

      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) =>
            typeof value === "string" ? value.trim() : value,
        });

      if (parsed.errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "The CSV contains parsing errors",
          errors: parsed.errors.slice(0, 5),
        });
      }

      const columns = parsed.meta.fields || [];
      const records = parsed.data;

      if (!columns.length || !records.length) {
        return res.status(400).json({
          success: false,
          message: "The CSV file is empty or has no valid columns",
        });
      }

      if (records.length > 5000) {
        return res.status(400).json({
          success: false,
          message: "Maximum 5,000 rows allowed per upload",
        });
      }

      let missingValues = 0;
      let duplicateRows = 0;

      const seenRows = new Set();

      records.forEach((record) => {
        columns.forEach((column) => {
          const value = record[column];

          if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
          ) {
            missingValues++;
          }
        });

        const rowKey = JSON.stringify(
          columns.map((column) => record[column])
        );

        if (seenRows.has(rowKey)) {
          duplicateRows++;
        }

        seenRows.add(rowKey);
      });

      const totalCells = records.length * columns.length;
      const totalIssues = missingValues + duplicateRows;

      const qualityScore = totalCells
        ? Math.max(
            0,
            Number(((1 - totalIssues / totalCells) * 100).toFixed(2))
          )
        : 100;

      // MongoDB has a 16 MB document limit.
      // Keep a safety margin for BSON document overhead.
      const estimatedSize = Buffer.byteLength(
        JSON.stringify(records),
        "utf8"
      );

      if (estimatedSize > 8 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "Dataset is too large to store safely",
        });
      }

      const profiling = profileDataset(records, columns);
      const dataset = await Dataset.create({
        owner: req.user._id,
        name: req.file.originalname.replace(/\.csv$/i, ""),
        originalFilename: req.file.originalname,
        columns,
        rowCount: records.length,
        columnCount: columns.length,
        records,
        qualityScore,
        issueSummary: {
          missingValues,
          duplicateRows,
          invalidValues: 0,
        },
        status: "analysed",
        profile: profiling.columns,
        lastAnalysisAt: profiling.analysedAt,
      });

      return res.status(201).json({
        success: true,
        message: "CSV uploaded and analysed successfully",
        dataset: {
          id: dataset._id,
          name: dataset.name,
          originalFilename: dataset.originalFilename,
          columns: dataset.columns,
          rowCount: dataset.rowCount,
          columnCount: dataset.columnCount,
          qualityScore: dataset.qualityScore,
          issueSummary: dataset.issueSummary,
          status: dataset.status,
        },
      });
    } catch (error) {
      console.error("CSV upload error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to process the CSV file",
      });
    }
  },
];

// List datasets belonging to the logged-in user
exports.getDatasets = async (req, res) => {
  try {
    const datasets = await Dataset.find({
      owner: req.user._id,
    })
      .select("-records")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: datasets.length,
      datasets,
    });
  } catch (error) {
    console.error("Dataset retrieval error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve datasets",
    });
  }
};

// Get one dataset, including its records
exports.getDatasetById = async (req, res) => {
  try {
    const dataset = await Dataset.findOne({
      _id: req.params.id,
      owner: req.user._id,
    }).select("+records");

    if (!dataset) {
      return res.status(404).json({
        success: false,
        message: "Dataset not found",
      });
    }

    res.status(200).json({
      success: true,
      dataset,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid dataset ID",
    });
  }
};
