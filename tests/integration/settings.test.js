const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const app = require('../../backend/src/app');

describe('Settings API Integration Tests', () => {
  let testContext;
  let pool;
  let userToken;
  let userId;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'settings.int@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'JB',
        lastName: 'Straubel'
      });

    userId = res.body.data.user.id;
    userToken = res.body.data.token;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('GET /api/v1/settings', () => {
    test('Rejects unauthenticated request (401)', async () => {
      const res = await request(app).get('/api/v1/settings');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Retrieves user settings with categorized defaults (200)', async () => {
      const res = await request(app)
        .get('/api/v1/settings')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settings).toBeDefined();
      expect(res.body.data.settings.userId).toBe(userId);
      expect(res.body.data.settings.account.language).toBe('en');
      expect(res.body.data.settings.security.twoFactorEnabled).toBe(false);
      expect(res.body.data.settings.notifications.emailNotifications).toBe(true);
      expect(res.body.data.settings.preferences.theme).toBe('dark');
    });
  });

  describe('PATCH /api/v1/settings', () => {
    test('Rejects unauthenticated update (401)', async () => {
      const res = await request(app)
        .patch('/api/v1/settings')
        .send({ theme: 'light' });

      expect(res.status).toBe(401);
    });

    test('Updates nested settings successfully (200)', async () => {
      const res = await request(app)
        .patch('/api/v1/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          account: {
            language: 'es',
            timezone: 'America/Los_Angeles',
            displayName: 'JB Battery Vision'
          },
          security: {
            twoFactorEnabled: true,
            sessionTimeoutMinutes: 90
          },
          notifications: {
            marketingEmails: true,
            priceAlerts: false
          },
          preferences: {
            theme: 'light',
            defaultCurrency: 'USD',
            hidePortfolioBalance: true
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settings.account.language).toBe('es');
      expect(res.body.data.settings.account.displayName).toBe('JB Battery Vision');
      expect(res.body.data.settings.security.twoFactorEnabled).toBe(true);
      expect(res.body.data.settings.security.sessionTimeoutMinutes).toBe(90);
      expect(res.body.data.settings.notifications.marketingEmails).toBe(true);
      expect(res.body.data.settings.notifications.priceAlerts).toBe(false);
      expect(res.body.data.settings.preferences.theme).toBe('light');
      expect(res.body.data.settings.preferences.hidePortfolioBalance).toBe(true);
    });

    test('Rejects invalid theme choice (400 INVALID_THEME)', async () => {
      const res = await request(app)
        .patch('/api/v1/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          preferences: { theme: 'solarized-rainbow' }
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_THEME');
    });

    test('Rejects out-of-range session timeout (400 INVALID_SETTING_VALUE)', async () => {
      const res = await request(app)
        .patch('/api/v1/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          security: { sessionTimeoutMinutes: 5000 } // Exceeds 1440 mins
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_SETTING_VALUE');
    });
  });
});
