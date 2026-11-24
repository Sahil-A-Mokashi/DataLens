
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

const { searchOpenData } = require("../controllers/openDataController");

router.get("/search", searchOpenData);

module.exports = router;
