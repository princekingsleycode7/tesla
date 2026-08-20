const PaymentProvider = require('../../backend/src/services/payments/PaymentProvider');
const StripePaymentProvider = require('../../backend/src/services/payments/StripePaymentProvider');
const TeslaPayProvider = require('../../backend/src/services/payments/TeslaPayProvider');
const paymentProviderFactory = require('../../backend/src/services/payments/paymentProviderFactory');

describe('Payment Provider Abstraction & Unit Tests', () => {
  describe('PaymentProvider Base Interface', () => {
    class DummyProvider extends PaymentProvider {}
    const provider = new DummyProvider();

    test('Throws unimplemented error on base methods', async () => {
      expect(() => provider.getProviderName()).toThrow();
      await expect(provider.createPayment({})).rejects.toThrow();
      expect(() => provider.verifyWebhookSignature('', '')).toThrow();
      expect(() => provider.parseWebhookEvent('', {}, {})).toThrow();
      await expect(provider.getPaymentStatus('')).rejects.toThrow();
      await expect(provider.refundPayment('', 100)).rejects.toThrow();
    });
  });

  describe('StripePaymentProvider', () => {
    const stripe = new StripePaymentProvider({
      apiKey: 'sk_test_123',
      webhookSecret: 'whsec_test_secret'
    });

    test('Returns correct provider name', () => {
      expect(stripe.getProviderName()).toBe('STRIPE');
    });

    test('Generates checkout payment session', async () => {
      const result = await stripe.createPayment({
        paymentId: 'pay_123',
        amount: 1000,
        currency: 'USD'
      });

      expect(result.providerPaymentId).toBeDefined();
      expect(result.providerSessionId).toBeDefined();
      expect(result.checkoutUrl).toContain('stripe.com');
      expect(result.status).toBe('PENDING');
    });

    test('Verifies HMAC signatures accurately', () => {
      const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', 'whsec_test_secret')
        .update(rawBody)
        .digest('hex');

      const isValid = stripe.verifyWebhookSignature(rawBody, signature);
      expect(isValid).toBe(true);

      const isInvalid = stripe.verifyWebhookSignature(rawBody, 'wrong_sig');
      expect(isInvalid).toBe(false);
    });
  });

  describe('TeslaPayProvider', () => {
    const tesla = new TeslaPayProvider({
      webhookSecret: 'teslapay_whsec_secret'
    });

    test('Returns correct provider name', () => {
      expect(tesla.getProviderName()).toBe('TESLA_PAY');
    });

    test('Generates and verifies signed webhook payload', () => {
      const payload = { event_id: 'evt_tp_1', event_type: 'payment.settled', data: { amount: 5000 } };
      const signed = tesla.generateSignedWebhook(payload);

      expect(signed.signature).toBeDefined();
      expect(signed.headers['x-tesla-signature']).toBe(signed.signature);

      const isValid = tesla.verifyWebhookSignature(signed.payload, signed.signature);
      expect(isValid).toBe(true);
    });
  });

  describe('PaymentProviderFactory', () => {
    test('Lists registered providers', () => {
      const providers = paymentProviderFactory.listProviders();
      expect(providers).toContain('STRIPE');
      expect(providers).toContain('TESLA_PAY');
      expect(providers).toContain('SIMULATED');
    });

    test('Resolves requested provider instance', () => {
      const stripe = paymentProviderFactory.getProvider('STRIPE');
      expect(stripe.getProviderName()).toBe('STRIPE');

      const tesla = paymentProviderFactory.getProvider('TESLA_PAY');
      expect(tesla.getProviderName()).toBe('TESLA_PAY');
    });

    test('Falls back to default provider if unknown provider requested', () => {
      const fallback = paymentProviderFactory.getProvider('UNKNOWN_PROVIDER');
      expect(fallback).toBeDefined();
      expect(typeof fallback.getProviderName()).toBe('string');
    });
  });
});
