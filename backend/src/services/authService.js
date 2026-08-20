const { getPool } = require('../config/database');
const userRepository = require('../repositories/userRepository');
const sessionRepository = require('../repositories/sessionRepository');
const auditRepository = require('../repositories/auditRepository');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { hashToken, generateRandomToken, generateAuthToken } = require('../utils/token');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Sanitizes user record by removing password hash and sensitive fields.
   */
  sanitizeUser(user) {
    if (!user) return null;
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Register a new user with institutional profile and security records.
   */
  async register({
    email,
    password,
    firstName = null,
    lastName = null,
    phone = null,
    country = null,
    currency = 'USD',
    ipAddress = null,
    userAgent = null
  }, customPool = null) {
    const pool = customPool || getPool();

    // 1. Input format validations
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      const err = new Error('A valid email address is required');
      err.code = 'INVALID_EMAIL';
      err.statusCode = 400;
      throw err;
    }

    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      const err = new Error(passwordValidation.message);
      err.code = 'WEAK_PASSWORD';
      err.statusCode = 400;
      throw err;
    }

    // 2. Check for duplicate account
    const existing = await userRepository.findByEmail(email, pool);
    if (existing) {
      const err = new Error('An account with this email address already exists');
      err.code = 'DUPLICATE_EMAIL';
      err.statusCode = 409;
      throw err;
    }

    // 3. Hash password
    const passwordHash = await hashPassword(password);

    // 4. Transactional execution
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create User
      const user = await userRepository.createUser({
        email: email.trim(),
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: false
      }, client);

      // Create Profile
      const profile = await userRepository.createProfile({
        userId: user.id,
        firstName,
        lastName,
        phone,
        country,
        currency
      }, client);

      // Generate JWT Auth Token
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role
      };
      const authToken = generateAuthToken(tokenPayload);
      const tokenDigest = hashToken(authToken);

      // Calculate session expiration (7 days default)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create Session Record
      await sessionRepository.createSession({
        userId: user.id,
        tokenHash: tokenDigest,
        tokenType: 'SESSION',
        ipAddress,
        userAgent,
        expiresAt
      }, client);

      // Generate Email Verification Token
      const rawVerificationToken = generateRandomToken(32);
      const verificationTokenHash = hashToken(rawVerificationToken);
      const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await sessionRepository.createSession({
        userId: user.id,
        tokenHash: verificationTokenHash,
        tokenType: 'EMAIL_VERIFICATION',
        ipAddress,
        userAgent,
        expiresAt: verificationExpiresAt
      }, client);

      // Record Audit Event
      await auditRepository.recordLog({
        userId: user.id,
        action: 'USER_REGISTERED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { email: user.email, role: user.role, country }
      }, client);

      await client.query('COMMIT');

      logger.info('User successfully registered:', { userId: user.id, email: user.email });

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          email_verified: user.email_verified,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          country: profile.country,
          currency: profile.currency,
          kyc_status: profile.kyc_status,
          accreditation_status: profile.accreditation_status,
          created_at: user.created_at
        },
        token: authToken,
        emailVerificationToken: rawVerificationToken
      };
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Registration failed:', { error: err.message, email });
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Authenticate user credentials and return a signed session.
   */
  async login({ email, password, ipAddress = null, userAgent = null }, customPool = null) {
    const pool = customPool || getPool();

    if (!email || !password) {
      const err = new Error('Email and password are required');
      err.code = 'MISSING_CREDENTIALS';
      err.statusCode = 400;
      throw err;
    }

    const user = await userRepository.findByEmail(email, pool);
    if (!user) {
      await auditRepository.recordLog({
        userId: null,
        action: 'LOGIN_FAILED_NONEXISTENT_USER',
        entityType: 'AUTH',
        ipAddress,
        userAgent,
        metadata: { email: email.trim() }
      }, pool);

      const err = new Error('Invalid email or password');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
      const err = new Error(`Account is currently ${user.status.toLowerCase()}`);
      err.code = 'ACCOUNT_DISABLED';
      err.statusCode = 403;
      throw err;
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      await auditRepository.recordLog({
        userId: user.id,
        action: 'LOGIN_FAILED_BAD_PASSWORD',
        entityType: 'AUTH',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { email: user.email }
      }, pool);

      const err = new Error('Invalid email or password');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // Generate JWT
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role
    };
    const authToken = generateAuthToken(tokenPayload);
    const tokenDigest = hashToken(authToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Track active session
    await sessionRepository.createSession({
      userId: user.id,
      tokenHash: tokenDigest,
      tokenType: 'SESSION',
      ipAddress,
      userAgent,
      expiresAt
    }, pool);

    // Record Audit
    await auditRepository.recordLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'AUTH',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: { email: user.email }
    }, pool);

    // Fetch full profile
    const userWithProfile = await userRepository.getUserWithProfile(user.id, pool);

    return {
      user: this.sanitizeUser(userWithProfile),
      token: authToken
    };
  }

  /**
   * Log out active session by invalidating the token.
   */
  async logout({ token, userId = null, ipAddress = null, userAgent = null }, customPool = null) {
    const pool = customPool || getPool();

    if (token) {
      const tokenDigest = hashToken(token);
      await sessionRepository.revokeSession(tokenDigest, pool);
    }

    if (userId) {
      await auditRepository.recordLog({
        userId,
        action: 'USER_LOGGED_OUT',
        entityType: 'AUTH',
        entityId: userId,
        ipAddress,
        userAgent
      }, pool);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Retrieve current user with full profile and permissions.
   */
  async getCurrentUser(userId, customPool = null) {
    const pool = customPool || getPool();
    const userWithProfile = await userRepository.getUserWithProfile(userId, pool);

    if (!userWithProfile) {
      const err = new Error('User not found');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (userWithProfile.status === 'SUSPENDED' || userWithProfile.status === 'DEACTIVATED') {
      const err = new Error(`Account is currently ${userWithProfile.status.toLowerCase()}`);
      err.code = 'ACCOUNT_DISABLED';
      err.statusCode = 403;
      throw err;
    }

    return this.sanitizeUser(userWithProfile);
  }

  /**
   * Initiate forgot-password workflow.
   */
  async forgotPassword({ email, ipAddress = null, userAgent = null }, customPool = null) {
    const pool = customPool || getPool();

    if (!email || typeof email !== 'string') {
      const err = new Error('A valid email address is required');
      err.code = 'INVALID_EMAIL';
      err.statusCode = 400;
      throw err;
    }

    const user = await userRepository.findByEmail(email, pool);
    let resetToken = null;

    if (user && user.status === 'ACTIVE') {
      // Invalidate existing reset tokens for this user
      await sessionRepository.revokeAllUserSessions(user.id, 'PASSWORD_RESET', pool);

      resetToken = generateRandomToken(32);
      const tokenDigest = hashToken(resetToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await sessionRepository.createSession({
        userId: user.id,
        tokenHash: tokenDigest,
        tokenType: 'PASSWORD_RESET',
        ipAddress,
        userAgent,
        expiresAt
      }, pool);

      await auditRepository.recordLog({
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'AUTH',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { email: user.email }
      }, pool);
    }

    return {
      message: 'If an account with that email exists, password reset instructions have been dispatched.',
      resetToken // Returned to facilitate integration tests and local verification
    };
  }

  /**
   * Reset password using a valid reset token.
   */
  async resetPassword({ token, newPassword, ipAddress = null, userAgent = null }, customPool = null) {
    const pool = customPool || getPool();

    if (!token || typeof token !== 'string') {
      const err = new Error('Password reset token is required');
      err.code = 'INVALID_RESET_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      const err = new Error(passwordValidation.message);
      err.code = 'WEAK_PASSWORD';
      err.statusCode = 400;
      throw err;
    }

    const tokenDigest = hashToken(token);
    const session = await sessionRepository.findSessionByTokenHash(tokenDigest, pool);

    if (!session || session.token_type !== 'PASSWORD_RESET' || session.is_revoked) {
      const err = new Error('Password reset token is invalid or has already been used');
      err.code = 'INVALID_RESET_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    if (new Date(session.expires_at) < new Date()) {
      const err = new Error('Password reset token has expired');
      err.code = 'EXPIRED_RESET_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const passwordHash = await hashPassword(newPassword);
      await userRepository.updatePassword(session.user_id, passwordHash, client);

      // Invalidate the reset token
      await sessionRepository.revokeSession(tokenDigest, client);

      // Invalidate all active user login sessions for security
      await sessionRepository.revokeAllUserSessions(session.user_id, 'SESSION', client);

      await auditRepository.recordLog({
        userId: session.user_id,
        action: 'PASSWORD_RESET_SUCCESS',
        entityType: 'AUTH',
        entityId: session.user_id,
        ipAddress,
        userAgent
      }, client);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Password has been successfully reset. Please log in with your new credentials.'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Change password for an authenticated user.
   */
  async changePassword({
    userId,
    currentPassword,
    newPassword,
    ipAddress = null,
    userAgent = null
  }, customPool = null) {
    const pool = customPool || getPool();

    if (!currentPassword || !newPassword) {
      const err = new Error('Current password and new password are required');
      err.code = 'MISSING_PASSWORD_FIELDS';
      err.statusCode = 400;
      throw err;
    }

    const user = await userRepository.findById(userId, pool);
    if (!user) {
      const err = new Error('User not found');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const isCurrentValid = await comparePassword(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      const err = new Error('Current password does not match');
      err.code = 'INVALID_CURRENT_PASSWORD';
      err.statusCode = 400;
      throw err;
    }

    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      const err = new Error(passwordValidation.message);
      err.code = 'WEAK_PASSWORD';
      err.statusCode = 400;
      throw err;
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(userId, passwordHash, pool);

    await auditRepository.recordLog({
      userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'AUTH',
      entityId: userId,
      ipAddress,
      userAgent
    }, pool);

    return {
      success: true,
      message: 'Password changed successfully'
    };
  }

  /**
   * Verify user's email address using token.
   */
  async verifyEmail({ token, ipAddress = null, userAgent = null }, customPool = null) {
    const pool = customPool || getPool();

    if (!token || typeof token !== 'string') {
      const err = new Error('Verification token is required');
      err.code = 'INVALID_VERIFICATION_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const tokenDigest = hashToken(token);
    const session = await sessionRepository.findSessionByTokenHash(tokenDigest, pool);

    if (!session || session.token_type !== 'EMAIL_VERIFICATION' || session.is_revoked) {
      const err = new Error('Verification token is invalid or has already been used');
      err.code = 'INVALID_VERIFICATION_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    if (new Date(session.expires_at) < new Date()) {
      const err = new Error('Verification token has expired');
      err.code = 'EXPIRED_VERIFICATION_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await userRepository.updateEmailVerification(session.user_id, true, client);
      await sessionRepository.revokeSession(tokenDigest, client);

      await auditRepository.recordLog({
        userId: session.user_id,
        action: 'EMAIL_VERIFIED',
        entityType: 'USER',
        entityId: session.user_id,
        ipAddress,
        userAgent
      }, client);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Email address verified successfully'
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthService();
