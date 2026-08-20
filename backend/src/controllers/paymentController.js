const paymentService = require('../services/paymentService');

/**
 * Controller handling Payments and Provider Webhooks
 */
const paymentController = {
  /**
   * Initializes a payment checkout order
   * POST /api/v1/payments/initialize
   */
  async initialize(req, res, next) {
    try {
      const {
        amount,
        currency,
        planId,
        paymentMethod,
        provider,
        idempotencyKey,
        returnUrl,
        cancelUrl,
        metadata
      } = req.body;

      const result = await paymentService.initializePayment({
        userId: req.user.id,
        userEmail: req.user.email,
        userName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
        amount,
        currency,
        planId,
        paymentMethod,
        provider,
        idempotencyKey,
        returnUrl,
        cancelUrl,
        metadata
      });

      const statusCode = result.isIdempotentReplay ? 200 : 201;
      return res.status(statusCode).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Retrieves single payment details
   * GET /api/v1/payments/:id
   */
  async getById(req, res, next) {
    try {
      const payment = await paymentService.getPaymentById(
        req.params.id,
        req.user.id,
        req.user.role
      );

      return res.status(200).json({
        success: true,
        data: { payment }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Lists authenticated user's payments
   * GET /api/v1/payments
   */
  async listUserPayments(req, res, next) {
    try {
      const { status, limit, offset } = req.query;
      const payments = await paymentService.getUserPayments(req.user.id, {
        status,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      return res.status(200).json({
        success: true,
        data: { payments }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Handles incoming payment gateway webhooks
   * POST /api/v1/payments/webhook
   * POST /api/v1/payments/webhook/:provider
   */
  async handleWebhook(req, res, next) {
    try {
      const providerName = req.params.provider || req.query.provider || 'TESLA_PAY';
      const rawBody = req.rawBody || req.body;
      const headers = req.headers;
      const parsedBody = req.body;

      const result = await paymentService.handleWebhookEvent({
        providerName,
        rawBody,
        headers,
        parsedBody
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = paymentController;
