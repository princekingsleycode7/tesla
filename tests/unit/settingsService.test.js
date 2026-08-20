const { setupTestDb } = require('../helpers/testDb');
const authService = require('../../backend/src/services/authService');
const settingsService = require('../../backend/src/services/settingsService');

describe('SettingsService Unit Tests', () => {
  let testContext;
  let pool;
  let testUser;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Register a test user
    const reg = await authService.register({
      email: 'settings.tester@tesla.com',
      password: 'StrongPassword!2026',
      firstName: 'Franz',
      lastName: 'Holzhausen'
    }, pool);

    testUser = reg.user;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('Get Settings', () => {
    test('Automatically initializes and returns default settings for user', async () => {
      const settings = await settingsService.getSettings(testUser.id, pool);

      expect(settings).toBeDefined();
      expect(settings.userId).toBe(testUser.id);
      expect(settings.account).toBeDefined();
      expect(settings.account.language).toBe('en');
      expect(settings.account.timezone).toBe('America/New_York');
      expect(settings.security.twoFactorEnabled).toBe(false);
      expect(settings.security.sessionTimeoutMinutes).toBe(60);
      expect(settings.notifications.emailNotifications).toBe(true);
      expect(settings.notifications.marketingEmails).toBe(false);
      expect(settings.preferences.theme).toBe('dark');
      expect(settings.preferences.defaultCurrency).toBe('USD');
    });
  });

  describe('Update Settings', () => {
    test('Successfully updates settings using structured nested object', async () => {
      const updated = await settingsService.updateSettings(testUser.id, {
        account: {
          language: 'de',
          timezone: 'Europe/Berlin',
          displayName: 'Franz Chief Design'
        },
        security: {
          twoFactorEnabled: true,
          sessionTimeoutMinutes: 120,
          loginAlertsEnabled: true
        },
        notifications: {
          marketingEmails: true,
          priceAlerts: false
        },
        preferences: {
          theme: 'light',
          defaultCurrency: 'EUR',
          hidePortfolioBalance: true,
          autoInvestEnabled: true
        }
      }, {}, pool);

      expect(updated.account.language).toBe('de');
      expect(updated.account.timezone).toBe('Europe/Berlin');
      expect(updated.account.displayName).toBe('Franz Chief Design');
      expect(updated.security.twoFactorEnabled).toBe(true);
      expect(updated.security.sessionTimeoutMinutes).toBe(120);
      expect(updated.notifications.marketingEmails).toBe(true);
      expect(updated.notifications.priceAlerts).toBe(false);
      expect(updated.preferences.theme).toBe('light');
      expect(updated.preferences.defaultCurrency).toBe('EUR');
      expect(updated.preferences.hidePortfolioBalance).toBe(true);
      expect(updated.preferences.autoInvestEnabled).toBe(true);
    });

    test('Successfully updates settings using flat property keys', async () => {
      const updated = await settingsService.updateSettings(testUser.id, {
        theme: 'system',
        language: 'fr',
        two_factor_enabled: false,
        session_timeout_minutes: 30
      }, {}, pool);

      expect(updated.preferences.theme).toBe('system');
      expect(updated.account.language).toBe('fr');
      expect(updated.security.twoFactorEnabled).toBe(false);
      expect(updated.security.sessionTimeoutMinutes).toBe(30);
    });

    test('Rejects invalid theme selection', async () => {
      await expect(
        settingsService.updateSettings(testUser.id, {
          preferences: { theme: 'neon-cyberpunk-invalid' }
        }, {}, pool)
      ).rejects.toMatchObject({
        code: 'INVALID_THEME',
        statusCode: 400
      });
    });

    test('Rejects out-of-range session timeout minutes', async () => {
      await expect(
        settingsService.updateSettings(testUser.id, {
          security: { sessionTimeoutMinutes: 2 } // Minimum is 5 minutes
        }, {}, pool)
      ).rejects.toMatchObject({
        code: 'INVALID_SETTING_VALUE',
        statusCode: 400
      });
    });
  });
});
