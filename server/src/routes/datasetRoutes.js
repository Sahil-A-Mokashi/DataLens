
const express = require("express");
const {
  previewCleaning,
  applyCleaning,
  exportDataset,
  getDatasetVersions
} = require("../controllers/cleaningController");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  uploadCSV,
  getDatasets,
  getDatasetById,
  validateDatasetSchema
} = require("../controllers/datasetController");


router.use(protect);

router.post("/upload", uploadCSV);
router.get("/", getDatasets);
router.get("/:id/cleaning-preview", previewCleaning);
router.post("/:id/clean", applyCleaning);
router.post("/:id/validate-schema", validateDatasetSchema);
router.get("/:id/export", exportDataset);
router.get("/:id/versions", getDatasetVersions);
router.get("/:id", getDatasetById);

module.exports = router;
