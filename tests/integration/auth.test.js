const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const app = require('../../backend/src/app');

describe('Authentication API Integration Tests', () => {
  let testContext;
  let pool;
  let registeredUser;
  let userToken;
  let emailVerificationToken;
  let passwordResetToken;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('POST /api/v1/auth/register', () => {
    test('Registers a new user successfully and returns standardized JSON envelope', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'Password!TSLA2026',
          firstName: 'Nikola',
          lastName: 'Tesla',
          phone: '+1-512-555-0199',
          country: 'United States'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('integration.tester@tesla.com');
      expect(res.body.data.user.first_name).toBe('Nikola');
      expect(res.body.data.user.password_hash).toBeUndefined();
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.emailVerificationToken).toBeDefined();

      registeredUser = res.body.data.user;
      userToken = res.body.data.token;
      emailVerificationToken = res.body.data.emailVerificationToken;
    });

    test('Rejects registration with duplicate email address', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'Password!TSLA2026',
          firstName: 'Another',
          lastName: 'Person'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
    });

    test('Rejects registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-valid-email',
          password: 'Password!TSLA2026'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Rejects registration with short password (< 8 chars)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'short.pass@tesla.com',
          password: 'Short1!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    test('Logs in successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'Password!TSLA2026'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('integration.tester@tesla.com');
      userToken = res.body.data.token;
    });

    test('Rejects login with invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'WrongPassword!123'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('Rejects login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ghost.user@tesla.com',
          password: 'Password!TSLA2026'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    test('Returns current user profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('integration.tester@tesla.com');
      expect(res.body.data.user.first_name).toBe('Nikola');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    test('Rejects request without Authorization header', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Rejects request with invalid Authorization token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    test('Verifies user email with valid verification token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          token: emailVerificationToken
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();

      // Check /me reflects verified email
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);
      expect(meRes.body.data.user.email_verified).toBe(true);
    });

    test('Rejects already consumed email verification token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({
          token: emailVerificationToken
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    });
  });

  describe('POST /api/v1/auth/forgot-password & reset-password', () => {
    test('Dispatches forgot-password instructions and provides reset token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'integration.tester@tesla.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();
      expect(res.body.data.resetToken).toBeDefined();

      passwordResetToken = res.body.data.resetToken;
    });

    test('Resets password with valid reset token and enforces new credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: passwordResetToken,
          newPassword: 'UpdatedSecurePass!2026'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login with new password works
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'UpdatedSecurePass!2026'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
      userToken = loginRes.body.data.token;
    });

    test('Rejects reset password token reuse', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: passwordResetToken,
          newPassword: 'ThirdPassword!2026'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    test('Changes password for authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'UpdatedSecurePass!2026',
          newPassword: 'FinalPassword!TSLA999'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify login with new changed password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'integration.tester@tesla.com',
          password: 'FinalPassword!TSLA999'
        });

      expect(loginRes.status).toBe(200);
      userToken = loginRes.body.data.token;
    });

    test('Rejects change password with incorrect current password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'IncorrectOldPassword!123',
          newPassword: 'AnotherPassword!2026'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    test('Logs out user and revokes active session', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify token can no longer access protected endpoints
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('SESSION_REVOKED');
    });
  });
});
