const express = require('express');
const planController = require('../../controllers/planController');

const router = express.Router();

/**
 * Public routes for viewing available investment plans
 */
router.get('/', (req, res, next) => planController.getPlans(req, res, next));
router.get('/:idOrSlug', (req, res, next) => planController.getPlanById(req, res, next));

module.exports = router;
