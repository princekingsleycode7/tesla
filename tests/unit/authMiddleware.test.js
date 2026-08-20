const { setupTestDb } = require('../helpers/testDb');
const authService = require('../../backend/src/services/authService');
const userRepository = require('../../backend/src/repositories/userRepository');
const sessionRepository = require('../../backend/src/repositories/sessionRepository');
const { requireAuth, requireRole, optionalAuth } = require('../../backend/src/middleware/auth');
const { hashToken } = require('../../backend/src/utils/token');

describe('Auth Middleware Unit Tests', () => {
  let testContext;
  let pool;
  let testUser;
  let testToken;
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Register standard user
    const reg = await authService.register({
      email: 'middleware.user@tesla.com',
      password: 'StrongUserPassword!123',
      firstName: 'Jane',
      lastName: 'Doe'
    }, pool);
    testUser = reg.user;
    testToken = reg.token;

    // Register admin user
    const adminReg = await authService.register({
      email: 'admin.operator@tesla.com',
      password: 'AdminPassword!456',
      firstName: 'Admin',
      lastName: 'Root'
    }, pool);
    // Update role to ADMIN
    await pool.query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [adminReg.user.id]);
    const adminLogin = await authService.login({
      email: 'admin.operator@tesla.com',
      password: 'AdminPassword!456'
    }, pool);
    adminUser = adminLogin.user;
    adminToken = adminLogin.token;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  function createMockReqRes(headers = {}) {
    const req = {
      headers,
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' }
    };
    const res = {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    const next = jest.fn();
    return { req, res, next };
  }

  describe('requireAuth Middleware', () => {
    test('Grants access for valid bearer token and attaches user to request', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${testToken}`
      });

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.email).toBe('middleware.user@tesla.com');
      expect(req.rawToken).toBe(testToken);
    });

    test('Rejects request with missing Authorization header', async () => {
      const { req, res, next } = createMockReqRes({});

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('UNAUTHORIZED');
    });

    test('Rejects request with invalid or corrupted token signature', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: 'Bearer invalid.token.payload'
      });

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('INVALID_TOKEN');
    });

    test('Rejects request with revoked session token', async () => {
      const login = await authService.login({
        email: 'middleware.user@tesla.com',
        password: 'StrongUserPassword!123'
      }, pool);

      // Revoke the session
      await sessionRepository.revokeSession(hashToken(login.token), pool);

      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${login.token}`
      });

      await requireAuth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error.code).toBe('SESSION_REVOKED');
    });
  });

  describe('requireRole Middleware', () => {
    test('Allows admin user to access ADMIN protected action', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { id: adminUser.id, role: 'ADMIN' };

      const guard = requireRole('ADMIN');
      guard(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('Denies standard USER access to ADMIN protected action', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { id: testUser.id, role: 'USER' };

      const guard = requireRole('ADMIN');
      guard(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.jsonData.error.code).toBe('FORBIDDEN');
    });

    test('Allows access when user matches any role in allowed list', async () => {
      const { req, res, next } = createMockReqRes();
      req.user = { id: testUser.id, role: 'USER' };

      const guard = requireRole('ADMIN', 'USER', 'OPERATOR');
      guard(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth Middleware', () => {
    test('Populates req.user when valid token is supplied', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${testToken}`
      });

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.email).toBe('middleware.user@tesla.com');
    });

    test('Leaves req.user undefined and continues when header is absent', async () => {
      const { req, res, next } = createMockReqRes();

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });
});
