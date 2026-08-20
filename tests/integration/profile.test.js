const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const app = require('../../backend/src/app');

describe('Profile API Integration Tests', () => {
  let testContext;
  let pool;
  let userToken;
  let secondUserToken;
  let userId;
  let secondUserId;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Create user 1
    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'profile.user1@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Nikola',
        lastName: 'Tesla',
        country: 'United States',
        phone: '+1-555-0100'
      });

    userId = res1.body.data.user.id;
    userToken = res1.body.data.token;

    // Create user 2
    const res2 = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'profile.user2@tesla.com',
        password: 'Password!TSLA2026',
        firstName: 'Thomas',
        lastName: 'Edison',
        country: 'United States'
      });

    secondUserId = res2.body.data.user.id;
    secondUserToken = res2.body.data.token;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('GET /api/v1/profile', () => {
    test('Rejects request without authentication (401)', async () => {
      const res = await request(app).get('/api/v1/profile');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    test('Returns authenticated user profile (200)', async () => {
      const res = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile).toBeDefined();
      expect(res.body.data.profile.userId).toBe(userId);
      expect(res.body.data.profile.email).toBe('profile.user1@tesla.com');
      expect(res.body.data.profile.firstName).toBe('Nikola');
      expect(res.body.data.profile.lastName).toBe('Tesla');
      expect(res.body.data.profile.role).toBe('USER');
      expect(res.body.data.profile.status).toBe('ACTIVE');
      expect(res.body.data.profile.password_hash).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/profile', () => {
    test('Rejects unauthenticated profile updates (401)', async () => {
      const res = await request(app)
        .patch('/api/v1/profile')
        .send({ firstName: 'Unauthorized' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Updates user profile fields successfully (200)', async () => {
      const res = await request(app)
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          firstName: 'Nikola Master',
          lastName: 'Tesla Visionary',
          phone: '+1-555-9999',
          bio: 'Pioneer of alternating current electricity',
          city: 'Austin',
          stateProvince: 'TX',
          country: 'United States'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.firstName).toBe('Nikola Master');
      expect(res.body.data.profile.lastName).toBe('Tesla Visionary');
      expect(res.body.data.profile.phone).toBe('+1-555-9999');
      expect(res.body.data.profile.bio).toBe('Pioneer of alternating current electricity');
      expect(res.body.data.profile.city).toBe('Austin');
      expect(res.body.data.profile.stateProvince).toBe('TX');
    });

    test('Prevents user from modifying protected security / privilege fields', async () => {
      const res = await request(app)
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          role: 'ADMIN',
          status: 'SUSPENDED',
          kycStatus: 'VERIFIED',
          accreditationStatus: 'QUALIFIED_PURCHASER',
          emailVerified: true,
          firstName: 'Security Tester'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.profile.firstName).toBe('Security Tester');
      expect(res.body.data.profile.role).toBe('USER');
      expect(res.body.data.profile.status).toBe('ACTIVE');
      expect(res.body.data.profile.kycStatus).toBe('UNVERIFIED');
    });

    test('Rejects invalid data types (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .patch('/api/v1/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          firstName: 12345 // Must be string
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('User updates only modify their own profile, leaving other users unaffected', async () => {
      // Fetch user 2 profile
      const resUser2 = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${secondUserToken}`);

      expect(resUser2.body.data.profile.firstName).toBe('Thomas');
      expect(resUser2.body.data.profile.lastName).toBe('Edison');
    });
  });

  describe('POST /api/v1/profile/avatar', () => {
    test('Rejects unauthenticated avatar updates (401)', async () => {
      const res = await request(app)
        .post('/api/v1/profile/avatar')
        .send({ avatarUrl: 'https://example.com/pic.jpg' });

      expect(res.status).toBe(401);
    });

    test('Updates avatar with valid remote URL (200)', async () => {
      const res = await request(app)
        .post('/api/v1/profile/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ avatarUrl: 'https://digitalassets.tesla.com/tesla-contents/image/upload/avatar.jpg' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarUrl).toBe('https://digitalassets.tesla.com/tesla-contents/image/upload/avatar.jpg');
      expect(res.body.data.profile.avatarUrl).toBe('https://digitalassets.tesla.com/tesla-contents/image/upload/avatar.jpg');
    });

    test('Rejects malformed avatar payload (400)', async () => {
      const res = await request(app)
        .post('/api/v1/profile/avatar')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ avatarUrl: 'ftp://invalidscheme.com/pic.jpg' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_AVATAR_FORMAT');
    });
  });
});
