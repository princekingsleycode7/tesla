const express = require('express');
const investmentController = require('../../controllers/investmentController');
const planController = require('../../controllers/planController');
const { requireAuth } = require('../../middleware/auth');
const { validateInvestmentCreation } = require('../../middleware/validation');

const router = express.Router();

// Public plan browsing endpoints under /investments/plans
router.get('/plans', (req, res, next) => investmentController.getPlans(req, res, next));
router.get('/plans/:idOrSlug', (req, res, next) => planController.getPlanById(req, res, next));

// All subsequent investment endpoints require authentication
router.use(requireAuth);

// Portfolio and transactions history endpoints
router.get('/summary', (req, res, next) => investmentController.getPortfolioSummary(req, res, next));
router.get('/history', (req, res, next) => investmentController.getInvestmentHistory(req, res, next));
router.get('/transactions', (req, res, next) => investmentController.getInvestmentHistory(req, res, next));

// List and Create investments
router.get('/', (req, res, next) => investmentController.getUserInvestments(req, res, next));
router.post('/', validateInvestmentCreation, (req, res, next) => investmentController.createInvestment(req, res, next));

// Single investment detail and history
router.get('/:id', (req, res, next) => investmentController.getUserInvestmentById(req, res, next));
router.get('/:id/history', (req, res, next) => investmentController.getInvestmentHistory(req, res, next));

module.exports = router;
