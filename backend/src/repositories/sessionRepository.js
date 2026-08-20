const { getPool } = require('../config/database');

/**
 * Auth Sessions Data Access Repository
 */
class SessionRepository {
  /**
   * Insert a new session / token tracking record.
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.tokenHash
   * @param {string} [params.tokenType='SESSION']
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   * @param {Date|string} params.expiresAt
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async createSession({ userId, tokenHash, tokenType = 'SESSION', ipAddress = null, userAgent = null, expiresAt }, client = null) {
    const executor = client || getPool();
    const query = `
      INSERT INTO sessions (user_id, token_hash, token_type, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, token_hash, token_type, is_revoked, expires_at, created_at;
    `;
    const res = await executor.query(query, [userId, tokenHash, tokenType, ipAddress, userAgent, expiresAt]);
    return res.rows[0];
  }

  /**
   * Find an active session by token hash.
   * @param {string} tokenHash
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async findSessionByTokenHash(tokenHash, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT id, user_id, token_hash, token_type, is_revoked, expires_at, created_at
      FROM sessions
      WHERE token_hash = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [tokenHash]);
    return res.rows[0] || null;
  }

  /**
   * Revoke a specific session by token hash.
   * @param {string} tokenHash
   * @param {object} [client]
   * @returns {Promise<boolean>}
   */
  async revokeSession(tokenHash, client = null) {
    const executor = client || getPool();
    const query = `
      UPDATE sessions
      SET is_revoked = TRUE
      WHERE token_hash = $1;
    `;
    const res = await executor.query(query, [tokenHash]);
    return (res.rowCount || 0) > 0;
  }

  /**
   * Revoke all active sessions for a given user.
   * @param {string} userId
   * @param {string} [tokenType] - Optional specific type to revoke
   * @param {object} [client]
   * @returns {Promise<number>}
   */
  async revokeAllUserSessions(userId, tokenType = null, client = null) {
    const executor = client || getPool();
    let query;
    let params;

    if (tokenType) {
      query = `
        UPDATE sessions
        SET is_revoked = TRUE
        WHERE user_id = $1 AND token_type = $2 AND is_revoked = FALSE;
      `;
      params = [userId, tokenType];
    } else {
      query = `
        UPDATE sessions
        SET is_revoked = TRUE
        WHERE user_id = $1 AND is_revoked = FALSE;
      `;
      params = [userId];
    }

    const res = await executor.query(query, params);
    return res.rowCount || 0;
  }

  /**
   * Delete or cleanup expired sessions.
   * @param {object} [client]
   * @returns {Promise<number>}
   */
  async deleteExpiredSessions(client = null) {
    const executor = client || getPool();
    const query = `
      DELETE FROM sessions
      WHERE expires_at < CURRENT_TIMESTAMP OR is_revoked = TRUE;
    `;
    const res = await executor.query(query);
    return res.rowCount || 0;
  }
}

module.exports = new SessionRepository();
