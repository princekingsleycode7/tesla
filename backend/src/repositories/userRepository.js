const { getPool } = require('../config/database');

/**
 * User and Profile Data Access Repository
 */
class UserRepository {
  /**
   * Find a user record by email (case-insensitive).
   * @param {string} email
   * @param {object} [client] - Optional database client for transactional scope
   * @returns {Promise<object|null>}
   */
  async findByEmail(email, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT id, email, password_hash, role, status, email_verified, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const res = await executor.query(query, [email.trim()]);
    return res.rows[0] || null;
  }

  /**
   * Find a user record by UUID.
   * @param {string} id
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async findById(id, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT id, email, password_hash, role, status, email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [id]);
    return res.rows[0] || null;
  }

  /**
   * Insert a new user into the database.
   * @param {object} params
   * @param {string} params.email
   * @param {string} params.passwordHash
   * @param {string} [params.role='USER']
   * @param {string} [params.status='ACTIVE']
   * @param {boolean} [params.emailVerified=false]
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async createUser({ email, passwordHash, role = 'USER', status = 'ACTIVE', emailVerified = false }, client = null) {
    const executor = client || getPool();
    const query = `
      INSERT INTO users (email, password_hash, role, status, email_verified)
      VALUES (LOWER($1), $2, $3, $4, $5)
      RETURNING id, email, role, status, email_verified, created_at, updated_at;
    `;
    const res = await executor.query(query, [email.trim(), passwordHash, role, status, emailVerified]);
    return res.rows[0];
  }

  /**
   * Insert or update user profile.
   * @param {object} params
   * @param {string} params.userId
   * @param {string} [params.firstName]
   * @param {string} [params.lastName]
   * @param {string} [params.phone]
   * @param {string} [params.country]
   * @param {string} [params.currency='USD']
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async createProfile({ userId, firstName = null, lastName = null, phone = null, country = null, currency = 'USD' }, client = null) {
    const executor = client || getPool();
    const query = `
      INSERT INTO profiles (user_id, first_name, last_name, phone, country, currency)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, first_name, last_name, phone, country, currency, kyc_status, accreditation_status, created_at;
    `;
    const res = await executor.query(query, [userId, firstName, lastName, phone, country, currency]);
    return res.rows[0];
  }

  /**
   * Retrieve combined user and profile details.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async getUserWithProfile(userId, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT 
        u.id, 
        u.email, 
        u.role, 
        u.status, 
        u.email_verified, 
        u.created_at, 
        u.updated_at,
        p.id AS profile_id,
        p.first_name, 
        p.last_name, 
        p.phone, 
        p.country, 
        p.currency, 
        p.avatar_url,
        p.bio,
        p.address_line1,
        p.address_line2,
        p.city,
        p.state_province,
        p.postal_code,
        p.date_of_birth,
        p.occupation,
        p.kyc_status, 
        p.accreditation_status,
        p.metadata AS profile_metadata,
        p.created_at AS profile_created_at,
        p.updated_at AS profile_updated_at
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.id = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [userId]);
    return res.rows[0] || null;
  }

  /**
   * Update profile fields for a user.
   * @param {string} userId
   * @param {object} fields
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateProfile(userId, fields, client = null) {
    const executor = client || getPool();

    // Ensure profile row exists
    await executor.query(`
      INSERT INTO profiles (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING;
    `, [userId]);

    const allowedColumns = [
      'first_name', 'last_name', 'phone', 'country', 'currency',
      'avatar_url', 'bio', 'address_line1', 'address_line2',
      'city', 'state_province', 'postal_code', 'date_of_birth', 'occupation'
    ];

    const setClauses = [];
    const values = [userId];
    let paramIndex = 2;

    for (const [key, value] of Object.entries(fields)) {
      if (allowedColumns.includes(key)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.getUserWithProfile(userId, executor);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE profiles
      SET ${setClauses.join(', ')}
      WHERE user_id = $1
      RETURNING *;
    `;

    await executor.query(query, values);
    return this.getUserWithProfile(userId, executor);
  }

  /**
   * Update avatar URL for a user profile.
   * @param {string} userId
   * @param {string} avatarUrl
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateAvatar(userId, avatarUrl, client = null) {
    return this.updateProfile(userId, { avatar_url: avatarUrl }, client);
  }

  /**
   * Update password hash for a user.
   * @param {string} userId
   * @param {string} passwordHash
   * @param {object} [client]
   * @returns {Promise<boolean>}
   */
  async updatePassword(userId, passwordHash, client = null) {
    const executor = client || getPool();
    const query = `
      UPDATE users
      SET password_hash = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const res = await executor.query(query, [userId, passwordHash]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Update email verification state.
   * @param {string} userId
   * @param {boolean} [verified=true]
   * @param {object} [client]
   * @returns {Promise<boolean>}
   */
  async updateEmailVerification(userId, verified = true, client = null) {
    const executor = client || getPool();
    const query = `
      UPDATE users
      SET email_verified = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const res = await executor.query(query, [userId, verified]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Update account status (e.g. ACTIVE, SUSPENDED).
   * @param {string} userId
   * @param {string} status
   * @param {object} [client]
   * @returns {Promise<boolean>}
   */
  async updateStatus(userId, status, client = null) {
    const executor = client || getPool();
    const query = `
      UPDATE users
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;
    `;
    const res = await executor.query(query, [userId, status]);
    return (res.rowCount || 0) > 0;
  }
}

module.exports = new UserRepository();
