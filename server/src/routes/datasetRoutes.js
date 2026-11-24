
const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  uploadCSV,
  getDatasets,
  getDatasetById,
  deleteDataset,
  validateDatasetSchema,
  removeColumn,
  restoreColumn,
  renameColumn,
  renameAllColumns,
  addColumn
} = require("../controllers/datasetController");

const {
  previewCleaning,
  applyCleaning,
  exportDataset,
  getDatasetVersions,
  deleteDatasetVersion
} = require("../controllers/cleaningController");

// All dataset routes require authentication.
router.use(protect);

// Dataset upload and listing
router.post("/upload", uploadCSV);
router.get("/", getDatasets);

// Cleaning and assessment
router.get("/:id/cleaning-preview", previewCleaning);
router.post("/:id/clean", applyCleaning);
router.post("/:id/validate-schema", validateDatasetSchema);

// Export and version history
router.get("/:id/export", exportDataset);
router.get("/:id/versions", getDatasetVersions);
router.delete("/:id/versions/:versionId", deleteDatasetVersion);

// Structural column operations
router.post("/:id/columns/remove", removeColumn);
router.post("/:id/columns/restore", restoreColumn);
router.post("/:id/columns/rename", renameColumn);
router.post("/:id/columns/rename-all", renameAllColumns);
router.post("/:id/columns/add", addColumn);

// Dataset details and deletion
router.get("/:id", getDatasetById);
router.delete("/:id", deleteDataset);

module.exports = router;
