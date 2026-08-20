/**
 * Abstract PaymentProvider Base Class / Contract
 * Defines the standard interface that all payment gateway providers must implement.
 */
class PaymentProvider {
  /**
   * Returns the unique provider identifier string (e.g. 'STRIPE', 'TESLA_PAY', 'SIMULATED')
   * @returns {string}
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by subclass');
  }

  /**
   * Initializes a payment request with the external gateway
   * @param {Object} params
   * @param {string} params.paymentId Internal payment ID
   * @param {number} params.amount Amount in major currency units (e.g. 5000.00)
   * @param {string} params.currency Currency code (e.g. 'USD')
   * @param {string} [params.description] Payment description
   * @param {Object} [params.metadata] Custom metadata
   * @param {string} [params.returnUrl] Redirect return URL on success
   * @param {string} [params.cancelUrl] Redirect return URL on cancellation
   * @param {string} [params.userEmail] Customer email address
   * @param {string} [params.userName] Customer name
   * @returns {Promise<{
   *   providerPaymentId: string,
   *   providerSessionId?: string,
   *   checkoutUrl: string,
   *   clientSecret?: string,
   *   status: string,
   *   metadata?: Object
   * }>}
   */
  async createPayment(params) {
    throw new Error('createPayment() must be implemented by subclass');
  }

  /**
   * Cryptographically verifies the incoming webhook request signature
   * @param {Buffer|string} rawBody Raw request body buffer or string
   * @param {string} signature Header signature value
   * @param {Object} [headers] Full request headers
   * @returns {boolean}
   */
  verifyWebhookSignature(rawBody, signature, headers) {
    throw new Error('verifyWebhookSignature() must be implemented by subclass');
  }

  /**
   * Normalizes an incoming webhook payload into a canonical event structure
   * @param {Buffer|string} rawBody
   * @param {Object} headers
   * @param {Object} parsedBody
   * @returns {{
   *   eventId: string,
   *   eventType: string,
   *   providerPaymentId: string,
   *   status: 'SUCCESS'|'FAILED'|'CANCELLED'|'REFUNDED'|'PROCESSING'|'PENDING',
   *   amount: number,
   *   currency: string,
   *   paymentId?: string,
   *   metadata: Object,
   *   raw: Object
   * }}
   */
  parseWebhookEvent(rawBody, headers, parsedBody) {
    throw new Error('parseWebhookEvent() must be implemented by subclass');
  }

  /**
   * Retrieves live status of a payment from the provider
   * @param {string} providerPaymentId
   * @returns {Promise<{
   *   providerPaymentId: string,
   *   status: string,
   *   amount: number,
   *   currency: string,
   *   metadata?: Object
   * }>}
   */
  async getPaymentStatus(providerPaymentId) {
    throw new Error('getPaymentStatus() must be implemented by subclass');
  }

  /**
   * Issues a full or partial refund
   * @param {string} providerPaymentId
   * @param {number} amount
   * @param {string} [reason]
   * @returns {Promise<{
   *   refundId: string,
   *   status: string,
   *   amount: number,
   *   currency: string
   * }>}
   */
  async refundPayment(providerPaymentId, amount, reason) {
    throw new Error('refundPayment() must be implemented by subclass');
  }
}

module.exports = PaymentProvider;
