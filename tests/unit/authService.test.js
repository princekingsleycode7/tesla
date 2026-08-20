const { setupTestDb } = require('../helpers/testDb');
const authService = require('../../backend/src/services/authService');
const userRepository = require('../../backend/src/repositories/userRepository');
const sessionRepository = require('../../backend/src/repositories/sessionRepository');
const { hashToken } = require('../../backend/src/utils/token');

describe('AuthService Unit Tests', () => {
  let testContext;
  let pool;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('User Registration', () => {
    test('Successfully registers a user with profile and security records', async () => {
      const result = await authService.register({
        email: 'elon.investor@tesla.com',
        password: 'SuperSecurePassword!2026',
        firstName: 'Elon',
        lastName: 'Musk',
        country: 'United States',
        ipAddress: '127.0.0.1',
        userAgent: 'JestTestRunner'
      }, pool);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('elon.investor@tesla.com');
      expect(result.user.role).toBe('USER');
      expect(result.user.first_name).toBe('Elon');
      expect(result.token).toBeDefined();
      expect(result.emailVerificationToken).toBeDefined();
      expect(result.user.password_hash).toBeUndefined(); // Sensitive field must be stripped
    });

    test('Rejects registration with duplicate email address', async () => {
      await expect(authService.register({
        email: 'elon.investor@tesla.com',
        password: 'AnotherPassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'DUPLICATE_EMAIL',
        statusCode: 409
      });
    });

    test('Rejects registration with weak password (missing special char or number)', async () => {
      await expect(authService.register({
        email: 'weak.password@tesla.com',
        password: 'weakpasswordonly'
      }, pool)).rejects.toMatchObject({
        code: 'WEAK_PASSWORD',
        statusCode: 400
      });
    });

    test('Rejects registration with invalid email format', async () => {
      await expect(authService.register({
        email: 'not-an-email',
        password: 'SuperSecurePassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_EMAIL',
        statusCode: 400
      });
    });
  });

  describe('User Authentication & Login', () => {
    test('Successfully logs in user with valid credentials', async () => {
      const loginResult = await authService.login({
        email: 'elon.investor@tesla.com',
        password: 'SuperSecurePassword!2026',
        ipAddress: '127.0.0.1',
        userAgent: 'JestTestRunner'
      }, pool);

      expect(loginResult.user.email).toBe('elon.investor@tesla.com');
      expect(loginResult.token).toBeDefined();
      expect(loginResult.user.password_hash).toBeUndefined();
    });

    test('Rejects login with invalid password', async () => {
      await expect(authService.login({
        email: 'elon.investor@tesla.com',
        password: 'WrongPassword!123',
        ipAddress: '127.0.0.1'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401
      });
    });

    test('Rejects login for non-existent email', async () => {
      await expect(authService.login({
        email: 'nonexistent.user@tesla.com',
        password: 'SuperSecurePassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401
      });
    });

    test('Rejects login for suspended account', async () => {
      const user = await userRepository.findByEmail('elon.investor@tesla.com', pool);
      await userRepository.updateStatus(user.id, 'SUSPENDED', pool);

      await expect(authService.login({
        email: 'elon.investor@tesla.com',
        password: 'SuperSecurePassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'ACCOUNT_DISABLED',
        statusCode: 403
      });

      // Restore status to ACTIVE
      await userRepository.updateStatus(user.id, 'ACTIVE', pool);
    });
  });

  describe('Email Verification Flow', () => {
    test('Successfully verifies email with valid verification token', async () => {
      const reg = await authService.register({
        email: 'verify.test@tesla.com',
        password: 'SuperSecurePassword!2026',
        firstName: 'Verify',
        lastName: 'Candidate'
      }, pool);

      expect(reg.user.email_verified).toBe(false);

      const verifyResult = await authService.verifyEmail({
        token: reg.emailVerificationToken
      }, pool);

      expect(verifyResult.success).toBe(true);

      const updatedUser = await userRepository.findByEmail('verify.test@tesla.com', pool);
      expect(updatedUser.email_verified).toBe(true);
    });

    test('Rejects already used or invalid email verification token', async () => {
      await expect(authService.verifyEmail({
        token: 'invalid-or-already-used-token'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_VERIFICATION_TOKEN',
        statusCode: 400
      });
    });
  });

  describe('Password Forgot & Reset Flow', () => {
    let resetToken;

    test('Initiates password reset and generates secure token', async () => {
      const forgotRes = await authService.forgotPassword({
        email: 'elon.investor@tesla.com'
      }, pool);

      expect(forgotRes.message).toBeDefined();
      expect(forgotRes.resetToken).toBeDefined();
      resetToken = forgotRes.resetToken;
    });

    test('Successfully resets password with valid token and invalidates active sessions', async () => {
      const resetRes = await authService.resetPassword({
        token: resetToken,
        newPassword: 'BrandNewPassword!2026'
      }, pool);

      expect(resetRes.success).toBe(true);

      // Verify user can now log in with the new password
      const loginRes = await authService.login({
        email: 'elon.investor@tesla.com',
        password: 'BrandNewPassword!2026'
      }, pool);
      expect(loginRes.user.email).toBe('elon.investor@tesla.com');

      // Verify old password is now rejected
      await expect(authService.login({
        email: 'elon.investor@tesla.com',
        password: 'SuperSecurePassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS'
      });
    });

    test('Rejects token reuse on reset-password', async () => {
      await expect(authService.resetPassword({
        token: resetToken,
        newPassword: 'AnotherPassword!2026'
      }, pool)).rejects.toMatchObject({
        code: 'INVALID_RESET_TOKEN'
      });
    });
  });

  describe('Password Change & Logout', () => {
    test('Authenticated user can change their password', async () => {
      const user = await userRepository.findByEmail('elon.investor@tesla.com', pool);

      const changeRes = await authService.changePassword({
        userId: user.id,
        currentPassword: 'BrandNewPassword!2026',
        newPassword: 'ChangedPassword!999'
      }, pool);

      expect(changeRes.success).toBe(true);

      // Verify login with latest password
      const loginRes = await authService.login({
        email: 'elon.investor@tesla.com',
        password: 'ChangedPassword!999'
      }, pool);
      expect(loginRes.token).toBeDefined();
    });

    test('Revokes session on logout', async () => {
      const loginRes = await authService.login({
        email: 'elon.investor@tesla.com',
        password: 'ChangedPassword!999'
      }, pool);

      const logoutRes = await authService.logout({
        token: loginRes.token,
        userId: loginRes.user.id
      }, pool);

      expect(logoutRes.success).toBe(true);

      const tokenDigest = hashToken(loginRes.token);
      const session = await sessionRepository.findSessionByTokenHash(tokenDigest, pool);
      expect(session.is_revoked).toBe(true);
    });
  });
});
