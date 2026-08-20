const express = require('express');
const paymentController = require('../../controllers/paymentController');
const { authenticate } = require('../../middleware/auth');
const { validatePaymentInitialization } = require('../../middleware/validation');

const router = express.Router();

// 1. Webhook Endpoints (Public — Verified via Cryptographic Signature in Service)
router.post('/webhook', paymentController.handleWebhook);
router.post('/webhook/:provider', paymentController.handleWebhook);

// 2. Authenticated Endpoints
router.post('/initialize', authenticate, validatePaymentInitialization, paymentController.initialize);
router.get('/', authenticate, paymentController.listUserPayments);
router.get('/:id', authenticate, paymentController.getById);

module.exports = router;
