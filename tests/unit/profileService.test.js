const { setupTestDb } = require('../helpers/testDb');
const authService = require('../../backend/src/services/authService');
const profileService = require('../../backend/src/services/profileService');
const userRepository = require('../../backend/src/repositories/userRepository');

describe('ProfileService Unit Tests', () => {
  let testContext;
  let pool;
  let testUser;

  beforeAll(async () => {
    testContext = await setupTestDb();
    pool = testContext.pool;

    // Register a test user
    const reg = await authService.register({
      email: 'profile.tester@tesla.com',
      password: 'StrongPassword!2026',
      firstName: 'Nikola',
      lastName: 'Tesla',
      country: 'United States'
    }, pool);

    testUser = reg.user;
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('Retrieve Profile', () => {
    test('Successfully retrieves sanitized profile for existing user', async () => {
      const profile = await profileService.getProfile(testUser.id, pool);

      expect(profile).toBeDefined();
      expect(profile.userId).toBe(testUser.id);
      expect(profile.email).toBe('profile.tester@tesla.com');
      expect(profile.firstName).toBe('Nikola');
      expect(profile.lastName).toBe('Tesla');
      expect(profile.country).toBe('United States');
      expect(profile.role).toBe('USER');
      expect(profile.status).toBe('ACTIVE');
      expect(profile.kycStatus).toBe('UNVERIFIED');
      expect(profile.password_hash).toBeUndefined();
      expect(profile.passwordHash).toBeUndefined();
    });

    test('Throws 404 for non-existent user id', async () => {
      await expect(
        profileService.getProfile('00000000-0000-0000-0000-000000000000', pool)
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404
      });
    });
  });

  describe('Update Profile & Security Boundaries', () => {
    test('Successfully updates allowed profile fields', async () => {
      const updated = await profileService.updateProfile(testUser.id, {
        firstName: 'Nikola Updated',
        lastName: 'Tesla Genius',
        phone: '+1-555-0199',
        bio: 'Inventor, Electrical Engineer, Futurist',
        addressLine1: '3500 Deer Creek Road',
        city: 'Palo Alto',
        stateProvince: 'CA',
        postalCode: '94304',
        country: 'US',
        currency: 'USD'
      }, {}, pool);

      expect(updated.firstName).toBe('Nikola Updated');
      expect(updated.lastName).toBe('Tesla Genius');
      expect(updated.phone).toBe('+1-555-0199');
      expect(updated.bio).toBe('Inventor, Electrical Engineer, Futurist');
      expect(updated.addressLine1).toBe('3500 Deer Creek Road');
      expect(updated.city).toBe('Palo Alto');
      expect(updated.stateProvince).toBe('CA');
      expect(updated.postalCode).toBe('94304');
    });

    test('Prevents privilege escalation (role, status, kyc_status, email_verified remain unchanged)', async () => {
      const attackPayload = {
        role: 'SUPER_ADMIN',
        status: 'SUSPENDED',
        kycStatus: 'VERIFIED',
        kyc_status: 'VERIFIED',
        emailVerified: true,
        email_verified: true,
        accreditationStatus: 'QUALIFIED_PURCHASER',
        balance: 1000000000,
        firstName: 'Verified Nikola'
      };

      const result = await profileService.updateProfile(testUser.id, attackPayload, {}, pool);

      // Verify privileged fields were ignored and NOT updated
      expect(result.firstName).toBe('Verified Nikola');
      expect(result.role).toBe('USER'); // Did not become SUPER_ADMIN
      expect(result.status).toBe('ACTIVE'); // Did not change status
      expect(result.kycStatus).toBe('UNVERIFIED'); // Did not escalate KYC
      expect(result.accreditationStatus).toBe('NONE'); // Did not escalate accreditation

      // Double-check direct database record
      const dbRecord = await userRepository.getUserWithProfile(testUser.id, pool);
      expect(dbRecord.role).toBe('USER');
      expect(dbRecord.status).toBe('ACTIVE');
      expect(dbRecord.kyc_status).toBe('UNVERIFIED');
    });
  });

  describe('Avatar Management', () => {
    test('Successfully updates avatar with valid HTTPS URL', async () => {
      const result = await profileService.updateAvatar(
        testUser.id,
        'https://assets.tesla.com/avatars/nikola-profile.jpg',
        {},
        pool
      );

      expect(result.avatarUrl).toBe('https://assets.tesla.com/avatars/nikola-profile.jpg');
    });

    test('Successfully updates avatar with valid data URI', async () => {
      const sampleDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = await profileService.updateAvatar(testUser.id, sampleDataUri, {}, pool);

      expect(result.avatarUrl).toBe(sampleDataUri);
    });

    test('Rejects invalid avatar format (e.g. javascript: or plain text)', async () => {
      await expect(
        profileService.updateAvatar(testUser.id, 'javascript:alert(1)', {}, pool)
      ).rejects.toMatchObject({
        code: 'INVALID_AVATAR_FORMAT',
        statusCode: 400
      });
    });

    test('Rejects empty or non-string avatar payload', async () => {
      await expect(
        profileService.updateAvatar(testUser.id, '', {}, pool)
      ).rejects.toMatchObject({
        code: 'INVALID_AVATAR',
        statusCode: 400
      });
    });
  });
});
