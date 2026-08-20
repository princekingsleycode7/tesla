const express = require('express');
const dashboardController = require('../../controllers/dashboardController');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// All dashboard endpoints require authentication
router.use(requireAuth);

router.get('/', (req, res, next) => dashboardController.getOverview(req, res, next));
router.get('/overview', (req, res, next) => dashboardController.getOverview(req, res, next));
router.get('/summary', (req, res, next) => dashboardController.getOverview(req, res, next));
router.get('/investments', (req, res, next) => dashboardController.getInvestments(req, res, next));
router.get('/transactions', (req, res, next) => dashboardController.getTransactions(req, res, next));
router.get('/payments', (req, res, next) => dashboardController.getPayments(req, res, next));
router.get('/activity', (req, res, next) => dashboardController.getActivity(req, res, next));

module.exports = router;
