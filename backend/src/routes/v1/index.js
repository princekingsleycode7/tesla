const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const settingsRoutes = require('./settingsRoutes');
const planRoutes = require('./planRoutes');
const investmentRoutes = require('./investmentRoutes');

const router = express.Router();

// Mount v1 subroutes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/settings', settingsRoutes);
router.use('/plans', planRoutes);
router.use('/investments', investmentRoutes);

module.exports = router;

