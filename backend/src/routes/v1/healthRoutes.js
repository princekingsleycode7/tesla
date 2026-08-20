const express = require('express');
const { getHealth, getDetailedHealth } = require('../../controllers/healthController');

const router = express.Router();

// Public health check routes
router.get('/', getHealth);
router.get('/detailed', getDetailedHealth);

module.exports = router;
