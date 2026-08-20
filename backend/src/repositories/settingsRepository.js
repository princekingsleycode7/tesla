const { getPool } = require('../config/database');

/**
 * User Settings Data Access Repository
 */
class SettingsRepository {
  /**
   * Find settings record by user ID.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object|null>}
   */
  async findByUserId(userId, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT 
        id,
        user_id,
        language,
        timezone,
        display_name,
        two_factor_enabled,
        session_timeout_minutes,
        login_alerts_enabled,
        email_notifications,
        push_notifications,
        investment_updates,
        marketing_emails,
        price_alerts,
        security_alerts,
        theme,
        default_currency,
        hide_portfolio_balance,
        auto_invest_enabled,
        metadata,
        created_at,
        updated_at
      FROM user_settings
      WHERE user_id = $1
      LIMIT 1;
    `;
    const res = await executor.query(query, [userId]);
    return res.rows[0] || null;
  }

  /**
   * Insert default settings for a user.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async createDefaultSettings(userId, client = null) {
    const executor = client || getPool();
    const query = `
      INSERT INTO user_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const res = await executor.query(query, [userId]);
    return res.rows[0];
  }

  /**
   * Get settings for user or create default record if not present.
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async getOrCreateByUserId(userId, client = null) {
    const executor = client || getPool();
    const existing = await this.findByUserId(userId, executor);
    if (existing) return existing;
    return this.createDefaultSettings(userId, executor);
  }

  /**
   * Update user settings.
   * @param {string} userId
   * @param {object} fields
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async updateSettings(userId, fields, client = null) {
    const executor = client || getPool();

    // Ensure settings record exists first
    await this.getOrCreateByUserId(userId, executor);

    const allowedColumns = [
      'language',
      'timezone',
      'display_name',
      'two_factor_enabled',
      'session_timeout_minutes',
      'login_alerts_enabled',
      'email_notifications',
      'push_notifications',
      'investment_updates',
      'marketing_emails',
      'price_alerts',
      'security_alerts',
      'theme',
      'default_currency',
      'hide_portfolio_balance',
      'auto_invest_enabled',
      'metadata'
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
      return this.findByUserId(userId, executor);
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE user_settings
      SET ${setClauses.join(', ')}
      WHERE user_id = $1
      RETURNING *;
    `;

    const res = await executor.query(query, values);
    return res.rows[0];
  }
}

module.exports = new SettingsRepository();
