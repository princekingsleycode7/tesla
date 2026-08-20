const StripePaymentProvider = require('./StripePaymentProvider');
const TeslaPayProvider = require('./TeslaPayProvider');

/**
 * Registry & Factory for Payment Providers
 */
class PaymentProviderFactory {
  constructor() {
    this.providers = new Map();
    // Register default built-in providers
    this.register('STRIPE', new StripePaymentProvider());
    this.register('TESLA_PAY', new TeslaPayProvider());
    this.register('SIMULATED', new TeslaPayProvider({ webhookSecret: 'simulated_secret_key' }));
  }

  /**
   * Registers a new or custom payment provider
   * @param {string} name
   * @param {Object} providerInstance
   */
  register(name, providerInstance) {
    if (!name || typeof name !== 'string') {
      throw new Error('Provider name must be a non-empty string');
    }
    this.providers.set(name.toUpperCase(), providerInstance);
  }

  /**
   * Resolves a payment provider by name or returns the default provider
   * @param {string} [name]
   * @returns {import('./PaymentProvider')}
   */
  getProvider(name) {
    if (name && this.providers.has(name.toUpperCase())) {
      return this.providers.get(name.toUpperCase());
    }

    const defaultProviderName = (process.env.PAYMENT_PROVIDER || 'TESLA_PAY').toUpperCase();
    if (this.providers.has(defaultProviderName)) {
      return this.providers.get(defaultProviderName);
    }

    return this.providers.get('TESLA_PAY') || this.providers.get('STRIPE');
  }

  /**
   * Lists all registered provider names
   * @returns {string[]}
   */
  listProviders() {
    return Array.from(this.providers.keys());
  }
}

const factoryInstance = new PaymentProviderFactory();

module.exports = factoryInstance;
