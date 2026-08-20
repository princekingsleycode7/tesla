const express = require('express');
const settingsController = require('../../controllers/settingsController');
const { requireAuth } = require('../../middleware/auth');
const { validateSettingsUpdate } = require('../../middleware/validation');

const router = express.Router();

// All settings routes require authentication
router.use(requireAuth);

router.get('/', (req, res, next) => settingsController.getSettings(req, res, next));
router.patch('/', validateSettingsUpdate, (req, res, next) => settingsController.updateSettings(req, res, next));

module.exports = router;
