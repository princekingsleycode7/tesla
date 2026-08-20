const { getPool } = require('../config/database');

/**
 * Immutable Audit Logs Data Access Repository
 */
class AuditRepository {
  /**
   * Records a security, financial, or system audit event.
   * @param {object} params
   * @param {string} [params.userId]
   * @param {string} params.action
   * @param {string} params.entityType
   * @param {string} [params.entityId]
   * @param {string} [params.ipAddress]
   * @param {string} [params.userAgent]
   * @param {object} [params.previousState]
   * @param {object} [params.newState]
   * @param {object} [params.metadata]
   * @param {object} [client]
   * @returns {Promise<object>}
   */
  async recordLog({
    userId = null,
    action,
    entityType,
    entityId = null,
    ipAddress = null,
    userAgent = null,
    previousState = null,
    newState = null,
    metadata = {}
  }, client = null) {
    const executor = client || getPool();
    const query = `
      INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, ip_address, user_agent, previous_state, new_state, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, user_id, action, entity_type, entity_id, created_at;
    `;
    const res = await executor.query(query, [
      userId,
      action,
      entityType,
      entityId ? String(entityId) : null,
      ipAddress,
      userAgent,
      previousState ? JSON.stringify(previousState) : null,
      newState ? JSON.stringify(newState) : null,
      JSON.stringify(metadata || {})
    ]);
    return res.rows[0];
  }

  /**
   * Alias for recordLog
   */
  async logEvent(params, client = null) {
    return this.recordLog(params, client);
  }
}

module.exports = new AuditRepository();
