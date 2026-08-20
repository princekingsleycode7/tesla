const userRepository = require('../repositories/userRepository');
const auditRepository = require('../repositories/auditRepository');

/**
 * Profile Business Logic Service
 */
class ProfileService {
  /**
   * Formats raw user/profile database record into sanitized JSON response object
   */
  formatProfile(record) {
    if (!record) return null;

    return {
      id: record.profile_id || record.id,
      userId: record.id,
      email: record.email,
      firstName: record.first_name || '',
      lastName: record.last_name || '',
      phone: record.phone || '',
      country: record.country || '',
      currency: record.currency || 'USD',
      avatarUrl: record.avatar_url || null,
      bio: record.bio || '',
      addressLine1: record.address_line1 || '',
      addressLine2: record.address_line2 || '',
      city: record.city || '',
      stateProvince: record.state_province || '',
      postalCode: record.postal_code || '',
      dateOfBirth: record.date_of_birth ? record.date_of_birth.toString().split('T')[0] : null,
      occupation: record.occupation || '',
      kycStatus: record.kyc_status || 'UNVERIFIED',
      accreditationStatus: record.accreditation_status || 'NONE',
      role: record.role,
      status: record.status,
      emailVerified: Boolean(record.email_verified),
      createdAt: record.created_at,
      updatedAt: record.updated_at
    };
  }

  /**
   * Retrieves profile for authenticated user.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async getProfile(userId, client = null) {
    const record = await userRepository.getUserWithProfile(userId, client);
    if (!record) {
      const error = new Error('User profile not found');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    return this.formatProfile(record);
  }

  /**
   * Updates authenticated user's profile with strict security boundaries.
   * Privileged fields (role, status, verification status, balances) cannot be modified.
   * @param {string} userId
   * @param {object} updates
   * @param {object} [meta]
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateProfile(userId, updates = {}, meta = {}, client = null) {
    const existing = await userRepository.getUserWithProfile(userId, client);
    if (!existing) {
      const error = new Error('User profile not found');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Mapping and sanitizing input fields (explicit whitelist)
    const sanitizedDbFields = {};

    const fieldMap = {
      firstName: 'first_name',
      first_name: 'first_name',
      lastName: 'last_name',
      last_name: 'last_name',
      phone: 'phone',
      country: 'country',
      currency: 'currency',
      avatarUrl: 'avatar_url',
      avatar_url: 'avatar_url',
      bio: 'bio',
      addressLine1: 'address_line1',
      address_line1: 'address_line1',
      addressLine2: 'address_line2',
      address_line2: 'address_line2',
      city: 'city',
      stateProvince: 'state_province',
      state_province: 'state_province',
      postalCode: 'postal_code',
      postal_code: 'postal_code',
      dateOfBirth: 'date_of_birth',
      date_of_birth: 'date_of_birth',
      occupation: 'occupation'
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbCol = fieldMap[key];
      if (dbCol && value !== undefined) {
        // Enforce basic type checking
        if (value !== null && typeof value === 'string') {
          sanitizedDbFields[dbCol] = value.trim();
        } else if (value === null) {
          sanitizedDbFields[dbCol] = null;
        }
      }
    }

    // Perform database update
    const updatedRecord = await userRepository.updateProfile(userId, sanitizedDbFields, client);

    // Audit profile update
    await auditRepository.logEvent({
      userId,
      action: 'PROFILE_UPDATED',
      entityType: 'PROFILE',
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      previousState: {
        firstName: existing.first_name,
        lastName: existing.last_name,
        phone: existing.phone,
        country: existing.country
      },
      newState: sanitizedDbFields
    }, client);

    return this.formatProfile(updatedRecord);
  }

  /**
   * Updates avatar URL or base64 image data for authenticated user.
   * @param {string} userId
   * @param {string} avatarData
   * @param {object} [meta]
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateAvatar(userId, avatarData, meta = {}, client = null) {
    if (!avatarData || typeof avatarData !== 'string') {
      const error = new Error('Valid avatar URL or image data URI is required');
      error.code = 'INVALID_AVATAR';
      error.statusCode = 400;
      throw error;
    }

    const trimmed = avatarData.trim();
    const isDataUri = trimmed.startsWith('data:image/');
    const isHttpUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');

    if (!isDataUri && !isHttpUrl) {
      const error = new Error('Avatar must be an HTTP/HTTPS URL or a base64 image data URI');
      error.code = 'INVALID_AVATAR_FORMAT';
      error.statusCode = 400;
      throw error;
    }

    // Size limit for base64 data URIs: ~5MB max (~7M chars)
    if (isDataUri && trimmed.length > 7 * 1024 * 1024) {
      const error = new Error('Avatar image size exceeds 5MB limit');
      error.code = 'AVATAR_TOO_LARGE';
      error.statusCode = 400;
      throw error;
    }

    const updatedRecord = await userRepository.updateAvatar(userId, trimmed, client);

    // Audit avatar update
    await auditRepository.logEvent({
      userId,
      action: 'PROFILE_AVATAR_UPDATED',
      entityType: 'PROFILE',
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { avatarType: isDataUri ? 'DATA_URI' : 'REMOTE_URL' }
    }, client);

    return this.formatProfile(updatedRecord);
  }
}

module.exports = new ProfileService();
