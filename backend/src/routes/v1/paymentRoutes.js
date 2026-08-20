const express = require('express');
const paymentController = require('../../controllers/paymentController');
const { requireAuth } = require('../../middleware/auth');
const { validatePaymentInitialization } = require('../../middleware/validation');

const router = express.Router();

// 1. Payment Methods Discovery Endpoint
router.get('/methods', paymentController.getPaymentMethods);

// 2. Webhook Endpoints (Public — Verified via Cryptographic Signature in Service)
router.post('/webhook', paymentController.handleWebhook);
router.post('/webhook/:provider', paymentController.handleWebhook);

// 3. Authenticated Endpoints
router.post('/initialize', requireAuth, validatePaymentInitialization, paymentController.initialize);
router.get('/', requireAuth, paymentController.listUserPayments);
router.get('/:id', requireAuth, paymentController.getById);

module.exports = router;
