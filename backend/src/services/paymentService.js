const crypto = require('crypto');
const { withTransaction } = require('../config/database');
const paymentRepository = require('../repositories/paymentRepository');
const webhookEventRepository = require('../repositories/webhookEventRepository');
const transactionRepository = require('../repositories/transactionRepository');
const investmentRepository = require('../repositories/investmentRepository');
const planRepository = require('../repositories/planRepository');
const auditRepository = require('../repositories/auditRepository');
const paymentProviderFactory = require('./payments/paymentProviderFactory');
const investmentCalculationService = require('./investmentCalculationService');
const logger = require('../utils/logger');

// Valid state machine transitions
const VALID_TRANSITIONS = {
  PENDING: ['PROCESSING', 'SUCCESS', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCESS', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCESS: ['REFUNDED'],
  SUCCEEDED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: []
};

class PaymentService {
  /**
   * Initializes a payment order and requests a checkout session from the provider
   */
  async initializePayment(params) {
    const {
      userId,
      userEmail,
      userName,
      amount,
      currency = 'USD',
      planId = null,
      paymentMethod = 'DIRECT_ALLOCATION',
      provider: requestedProvider = null,
      idempotencyKey,
      returnUrl = 'https://tesla.com/portal',
      cancelUrl = 'https://tesla.com/portal',
      metadata = {}
    } = params;

    const numAmount = Number(amount);
    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      const error = new Error('Payment amount must be a positive number');
      error.statusCode = 400;
      error.code = 'INVALID_AMOUNT';
      throw error;
    }

    const safeCurrency = (currency || 'USD').toUpperCase();
    if (safeCurrency !== 'USD') {
      const error = new Error(`Unsupported currency: ${safeCurrency}. Only USD is accepted.`);
      error.statusCode = 400;
      error.code = 'UNSUPPORTED_CURRENCY';
      throw error;
    }

    const effectiveIdempotencyKey = idempotencyKey || `pay_idemp_${crypto.randomUUID()}`;

    // 1. Idempotency Check: Return existing payment if key was already used
    const existingPayment = await paymentRepository.findByIdempotencyKey(effectiveIdempotencyKey);
    if (existingPayment) {
      logger.info('Returning existing payment record for idempotency key', {
        idempotencyKey: effectiveIdempotencyKey,
        paymentId: existingPayment.id
      });
      return {
        payment: existingPayment,
        isIdempotentReplay: true
      };
    }

    // 2. Plan Verification (if linked to an investment product)
    let plan = null;
    if (planId) {
      plan = await planRepository.findById(planId);
      if (!plan) {
        const error = new Error('Investment plan not found');
        error.statusCode = 404;
        error.code = 'PLAN_NOT_FOUND';
        throw error;
      }
      if (plan.status !== 'ACTIVE') {
        const error = new Error('Selected investment plan is currently closed for new capital allocations');
        error.statusCode = 400;
        error.code = 'PLAN_INACTIVE';
        throw error;
      }
      if (numAmount < Number(plan.minInvestment)) {
        const error = new Error(`Minimum investment for ${plan.name} is $${Number(plan.minInvestment).toLocaleString()}`);
        error.statusCode = 400;
        error.code = 'MINIMUM_INVESTMENT_NOT_MET';
        throw error;
      }
      if (plan.maxInvestment && numAmount > Number(plan.maxInvestment)) {
        const error = new Error(`Maximum investment limit for ${plan.name} is $${Number(plan.maxInvestment).toLocaleString()}`);
        error.statusCode = 400;
        error.code = 'MAXIMUM_INVESTMENT_EXCEEDED';
        throw error;
      }
    }

    // 3. Resolve Provider
    const providerInstance = paymentProviderFactory.getProvider(requestedProvider);
    const providerName = providerInstance.getProviderName();

    // 4. Atomic Database Setup
    const payment = await withTransaction(async (client) => {
      // Create ledger transaction
      const txRef = `TX-PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const transaction = await transactionRepository.create({
        referenceId: txRef,
        userId,
        type: 'PAYMENT',
        amount: numAmount,
        currency: safeCurrency,
        status: 'PENDING',
        description: plan ? `Subscription allocation: ${plan.name}` : 'Tesla Capital Account Funding',
        metadata: {
          planId: plan ? plan.id : null,
          provider: providerName,
          ...metadata
        }
      }, client);

      // Create Payment Record
      const createdPayment = await paymentRepository.create({
        userId,
        transactionId: transaction.id,
        provider: providerName,
        amount: numAmount,
        currency: safeCurrency,
        status: 'PENDING',
        idempotencyKey: effectiveIdempotencyKey,
        paymentMethodDetails: {
          method: paymentMethod,
          channel: 'DIGITAL_GATEWAY'
        },
        metadata: {
          planId: plan ? plan.id : null,
          planName: plan ? plan.name : null,
          ...metadata
        }
      }, client);

      return createdPayment;
    });

    // 5. Call Provider to Generate Payment Request / Checkout URL
    try {
      const providerResult = await providerInstance.createPayment({
        paymentId: payment.id,
        amount: numAmount,
        currency: safeCurrency,
        description: plan ? `Tesla Allocation: ${plan.name}` : 'Tesla Account Funding',
        metadata: {
          paymentId: payment.id,
          userId,
          planId: plan ? plan.id : null
        },
        returnUrl,
        cancelUrl,
        userEmail,
        userName
      });

      // Update payment with provider IDs and checkout URL
      const updatedPayment = await paymentRepository.updateStatus(payment.id, 'PENDING', {
        providerPaymentId: providerResult.providerPaymentId,
        providerSessionId: providerResult.providerSessionId,
        metadata: {
          ...payment.metadata,
          checkoutUrl: providerResult.checkoutUrl,
          clientSecret: providerResult.clientSecret
        }
      });

      logger.info('Payment initialized successfully', {
        paymentId: updatedPayment.id,
        provider: providerName,
        providerPaymentId: providerResult.providerPaymentId,
        amount: numAmount
      });

      return {
        payment: {
          ...updatedPayment,
          checkoutUrl: providerResult.checkoutUrl,
          clientSecret: providerResult.clientSecret
        },
        isIdempotentReplay: false
      };
    } catch (err) {
      logger.error('Failed to initialize payment with external provider', {
        paymentId: payment.id,
        provider: providerName,
        error: err.message
      });

      await paymentRepository.updateStatus(payment.id, 'FAILED', {
        errorDetails: {
          message: err.message,
          timestamp: new Date().toISOString()
        }
      });

      const error = new Error(`Payment provider initialization failed: ${err.message}`);
      error.statusCode = 502;
      error.code = 'PROVIDER_INITIALIZATION_ERROR';
      throw error;
    }
  }

  /**
   * Handles incoming webhooks with signature verification, duplicate filtering, and atomic ledger settlement
   */
  async handleWebhookEvent({ providerName, rawBody, headers, parsedBody }) {
    const providerInstance = paymentProviderFactory.getProvider(providerName);
    const resolvedProviderName = providerInstance.getProviderName();

    // 1. Signature Verification
    const signature = headers['x-tesla-signature'] || 
                      headers['stripe-signature'] || 
                      headers['x-signature'] || 
                      headers['x-webhook-signature'] || '';

    const isSignatureValid = providerInstance.verifyWebhookSignature(rawBody, signature, headers);
    if (!isSignatureValid) {
      logger.warn('Rejected webhook: Invalid or missing cryptographic signature', {
        provider: resolvedProviderName,
        signaturePresent: !!signature
      });
      const error = new Error('Invalid or missing webhook signature');
      error.statusCode = 400;
      error.code = 'INVALID_WEBHOOK_SIGNATURE';
      throw error;
    }

    // 2. Parse & Normalize Event
    const event = providerInstance.parseWebhookEvent(rawBody, headers, parsedBody);
    const {
      eventId,
      eventType,
      providerPaymentId,
      status: targetStatus,
      amount: eventAmount,
      currency: eventCurrency,
      paymentId: eventPaymentId,
      metadata = {}
    } = event;

    if (!eventId) {
      const error = new Error('Invalid webhook payload: Missing event identifier');
      error.statusCode = 400;
      error.code = 'MISSING_EVENT_ID';
      throw error;
    }

    // 3. Duplicate / Replay Check (Idempotency)
    const existingEvent = await webhookEventRepository.findByProviderAndEventId(resolvedProviderName, eventId);
    if (existingEvent && existingEvent.status === 'PROCESSED') {
      logger.info('Duplicate webhook event ignored (idempotent)', {
        provider: resolvedProviderName,
        eventId
      });
      return {
        success: true,
        duplicate: true,
        message: 'Webhook event already processed'
      };
    }

    // 4. Lookup Payment Record
    let payment = null;
    if (eventPaymentId) {
      payment = await paymentRepository.findById(eventPaymentId);
    }
    if (!payment && providerPaymentId) {
      payment = await paymentRepository.findByProviderPaymentId(providerPaymentId);
    }
    if (!payment && metadata.paymentId) {
      payment = await paymentRepository.findById(metadata.paymentId);
    }

    if (!payment) {
      logger.error('Webhook references nonexistent payment transaction', {
        provider: resolvedProviderName,
        eventId,
        providerPaymentId,
        eventPaymentId
      });

      // Record event as failed
      await webhookEventRepository.recordEvent({
        eventId,
        provider: resolvedProviderName,
        eventType,
        status: 'FAILED',
        payload: parsedBody || {},
        signature,
        errorMessage: 'Associated payment record not found'
      });

      const error = new Error('Referenced payment record was not found');
      error.statusCode = 404;
      error.code = 'PAYMENT_NOT_FOUND';
      throw error;
    }

    // 5. Validation: Currency & Amount Integrity
    if (eventCurrency && payment.currency && eventCurrency.toUpperCase() !== payment.currency.toUpperCase()) {
      logger.error('Webhook rejected: Currency mismatch', {
        expected: payment.currency,
        received: eventCurrency,
        paymentId: payment.id
      });

      await webhookEventRepository.recordEvent({
        eventId,
        provider: resolvedProviderName,
        eventType,
        paymentId: payment.id,
        status: 'FAILED',
        payload: parsedBody || {},
        signature,
        errorMessage: `Currency mismatch: expected ${payment.currency}, received ${eventCurrency}`
      });

      const error = new Error(`Payment currency mismatch: expected ${payment.currency}, got ${eventCurrency}`);
      error.statusCode = 400;
      error.code = 'CURRENCY_MISMATCH';
      throw error;
    }

    if (eventAmount !== undefined && eventAmount !== null && Number(eventAmount) > 0) {
      const expectedAmount = Number(payment.amount);
      const receivedAmount = Number(eventAmount);
      // Precision tolerance of $0.01
      if (Math.abs(expectedAmount - receivedAmount) > 0.01) {
        logger.error('Webhook rejected: Amount mismatch', {
          expected: expectedAmount,
          received: receivedAmount,
          paymentId: payment.id
        });

        await webhookEventRepository.recordEvent({
          eventId,
          provider: resolvedProviderName,
          eventType,
          paymentId: payment.id,
          status: 'FAILED',
          payload: parsedBody || {},
          signature,
          errorMessage: `Amount mismatch: expected ${expectedAmount}, received ${receivedAmount}`
        });

        const error = new Error(`Payment amount mismatch: expected ${expectedAmount}, got ${receivedAmount}`);
        error.statusCode = 400;
        error.code = 'AMOUNT_MISMATCH';
        throw error;
      }
    }

    // 6. Safe State Transitions & Atomic Business Mutation
    const result = await withTransaction(async (client) => {
      // Re-fetch payment inside lock/transaction
      const currentPayment = await paymentRepository.findById(payment.id, client);
      const currentStatus = currentPayment.status;

      // Handle Already Completed / Settled
      if (currentStatus === 'SUCCESS' || currentStatus === 'SUCCEEDED') {
        if (targetStatus === 'SUCCESS' || targetStatus === 'SUCCEEDED') {
          logger.info('Payment already in SUCCESS state, skipping duplicate execution', {
            paymentId: currentPayment.id
          });
          await webhookEventRepository.recordEvent({
            eventId,
            provider: resolvedProviderName,
            eventType,
            paymentId: currentPayment.id,
            status: 'PROCESSED',
            payload: parsedBody || {},
            signature
          }, client);

          return {
            success: true,
            duplicate: true,
            payment: currentPayment,
            message: 'Payment already completed'
          };
        }
      }

      // Check transition validity
      const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowedNext.includes(targetStatus) && currentStatus !== targetStatus) {
        logger.warn('Illegal state transition attempted via webhook', {
          currentStatus,
          targetStatus,
          paymentId: currentPayment.id
        });
        // Still record event but do not corrupt state
        await webhookEventRepository.recordEvent({
          eventId,
          provider: resolvedProviderName,
          eventType,
          paymentId: currentPayment.id,
          status: 'IGNORED',
          payload: parsedBody || {},
          signature,
          errorMessage: `Illegal transition from ${currentStatus} to ${targetStatus}`
        }, client);

        return {
          success: true,
          ignored: true,
          payment: currentPayment,
          message: `Transition from ${currentStatus} to ${targetStatus} is disallowed`
        };
      }

      // Execute State Transitions
      let updatedPayment = currentPayment;

      if (targetStatus === 'SUCCESS' || targetStatus === 'SUCCEEDED') {
        // 1. Mark Payment as SUCCESS
        updatedPayment = await paymentRepository.updateStatus(currentPayment.id, 'SUCCESS', {
          providerPaymentId: providerPaymentId || currentPayment.providerPaymentId,
          metadata: {
            ...currentPayment.metadata,
            verifiedAt: new Date().toISOString(),
            eventId
          }
        }, client);

        // 2. Mark Linked Transaction as SETTLED
        if (currentPayment.transactionId) {
          await transactionRepository.updateStatus(currentPayment.transactionId, 'SETTLED', {
            settledAt: new Date().toISOString(),
            provider: resolvedProviderName,
            eventId
          }, client);
        }

        // 3. Update or Allocate Investment if linked
        const planId = currentPayment.metadata?.planId || metadata.planId;
        if (planId) {
          const plan = await planRepository.findById(planId, client);
          if (plan) {
            const certId = `TSLA-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
            const units = investmentCalculationService.calculateUnits(currentPayment.amount, plan.unitPrice);
            const calculations = investmentCalculationService.calculateProjectedReturns(
              currentPayment.amount,
              plan.expectedRoiPercentage,
              plan.durationMonths
            );
            const maturityDate = investmentCalculationService.calculateMaturityDate(plan.durationMonths);

            const investment = await investmentRepository.create({
              userId: currentPayment.userId,
              productId: plan.id,
              units,
              pricePerUnit: plan.unitPrice,
              totalAmount: currentPayment.amount,
              currency: currentPayment.currency,
              status: 'ACTIVE',
              certificateId: certId,
              startDate: new Date(),
              maturityDate,
              expectedReturnAmount: calculations.expectedReturnAmount,
              expectedTotalPayout: calculations.expectedTotalPayout,
              returnRate: plan.expectedRoiPercentage,
              idempotencyKey: `inv_pay_${currentPayment.id}`,
              metadata: {
                paymentId: currentPayment.id,
                planName: plan.name,
                planTicker: plan.ticker,
                provider: resolvedProviderName
              }
            }, client);

            // Increment plan total raised
            await planRepository.incrementTotalRaised(plan.id, currentPayment.amount, client);

            // Link to transaction and payment
            if (currentPayment.transactionId) {
              await transactionRepository.linkInvestment(currentPayment.transactionId, investment.id, client);
            }
            await paymentRepository.updateStatus(currentPayment.id, 'SUCCESS', {
              relatedInvestmentId: investment.id
            }, client);
          }
        }

        // 4. Record Audit Log
        await auditRepository.create({
          userId: currentPayment.userId,
          action: 'PAYMENT_VERIFIED_AND_SETTLED',
          entityType: 'PAYMENT',
          entityId: currentPayment.id,
          oldData: { status: currentStatus },
          newData: { status: 'SUCCESS', amount: currentPayment.amount, provider: resolvedProviderName },
          metadata: { eventId, eventType }
        }, client);

      } else if (targetStatus === 'FAILED') {
        updatedPayment = await paymentRepository.updateStatus(currentPayment.id, 'FAILED', {
          errorDetails: {
            reason: event.raw?.failure_message || 'Payment execution failed at gateway',
            eventId,
            timestamp: new Date().toISOString()
          }
        }, client);

        if (currentPayment.transactionId) {
          await transactionRepository.updateStatus(currentPayment.transactionId, 'FAILED', {
            reason: 'Payment failed at gateway'
          }, client);
        }

        await auditRepository.create({
          userId: currentPayment.userId,
          action: 'PAYMENT_FAILED',
          entityType: 'PAYMENT',
          entityId: currentPayment.id,
          oldData: { status: currentStatus },
          newData: { status: 'FAILED' },
          metadata: { eventId, eventType }
        }, client);

      } else if (targetStatus === 'CANCELLED') {
        updatedPayment = await paymentRepository.updateStatus(currentPayment.id, 'CANCELLED', {
          metadata: {
            ...currentPayment.metadata,
            cancelledAt: new Date().toISOString(),
            eventId
          }
        }, client);

        if (currentPayment.transactionId) {
          await transactionRepository.updateStatus(currentPayment.transactionId, 'CANCELLED', {}, client);
        }

      } else if (targetStatus === 'REFUNDED') {
        updatedPayment = await paymentRepository.updateStatus(currentPayment.id, 'REFUNDED', {
          metadata: {
            ...currentPayment.metadata,
            refundedAt: new Date().toISOString(),
            eventId
          }
        }, client);

        if (currentPayment.transactionId) {
          await transactionRepository.updateStatus(currentPayment.transactionId, 'REVERSED', {
            refundEventId: eventId
          }, client);
        }

        // Create immutable REFUND transaction record
        await transactionRepository.create({
          referenceId: `TX-REF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          userId: currentPayment.userId,
          type: 'REFUND',
          amount: currentPayment.amount,
          currency: currentPayment.currency,
          status: 'SETTLED',
          description: `Refund for payment ${currentPayment.id}`,
          metadata: {
            originalPaymentId: currentPayment.id,
            eventId
          }
        }, client);
      }

      // Record Webhook Event Audit Record as PROCESSED
      await webhookEventRepository.recordEvent({
        eventId,
        provider: resolvedProviderName,
        eventType,
        paymentId: currentPayment.id,
        status: 'PROCESSED',
        payload: parsedBody || {},
        signature
      }, client);

      return {
        success: true,
        payment: updatedPayment,
        message: `Payment status transitioned to ${targetStatus}`
      };
    });

    return result;
  }

  /**
   * Retrieves payment details for authorized user
   */
  async getPaymentById(paymentId, authenticatedUserId, userRole = 'INVESTOR') {
    const payment = await paymentRepository.findById(paymentId);
    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      error.code = 'PAYMENT_NOT_FOUND';
      throw error;
    }

    if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN' && payment.userId !== authenticatedUserId) {
      const error = new Error('You are not authorized to view this payment');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    return payment;
  }

  /**
   * Retrieves all payments for an authenticated user
   */
  async getUserPayments(userId, options = {}) {
    return paymentRepository.findByUserId(userId, options);
  }
}

module.exports = new PaymentService();
