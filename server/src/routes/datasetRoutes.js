
const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");

const {
  uploadCSV,
  getDatasets,
  getDatasetById,
} = require("../controllers/datasetController");

router.use(protect);

router.post("/upload", uploadCSV);
router.get("/", getDatasets);
router.get("/:id", getDatasetById);

module.exports = router;
