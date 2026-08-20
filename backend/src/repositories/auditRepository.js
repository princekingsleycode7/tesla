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
   * Alias for recordLog supporting create interface and oldData/newData
   */
  async create(params, client = null) {
    const { oldData, newData, previousState, newState, ...rest } = params || {};
    return this.recordLog({
      ...rest,
      previousState: previousState || oldData,
      newState: newState || newData
    }, client);
  }

  /**
   * Alias for recordLog
   */
  async logEvent(params, client = null) {
    return this.recordLog(params, client);
  }

  /**
   * Retrieves audit logs for a specific user with pagination
   * @param {string} userId
   * @param {object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {object} [client]
   * @returns {Promise<Array<object>>}
   */
  async findByUserId(userId, { limit = 50, offset = 0 } = {}, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT 
        id,
        user_id AS "userId",
        action,
        entity_type AS "entityType",
        entity_id AS "entityId",
        ip_address AS "ipAddress",
        user_agent AS "userAgent",
        previous_state AS "previousState",
        new_state AS "newState",
        metadata,
        created_at AS "createdAt"
      FROM audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    const res = await executor.query(query, [userId, limit, offset]);
    return res.rows;
  }

  /**
   * Counts audit log records for a specific user
   * @param {string} userId
   * @param {object} [client]
   * @returns {Promise<number>}
   */
  async countByUserId(userId, client = null) {
    const executor = client || getPool();
    const query = `
      SELECT COUNT(*)::int AS count
      FROM audit_logs
      WHERE user_id = $1;
    `;
    const res = await executor.query(query, [userId]);
    return res.rows[0]?.count || 0;
  }
}

module.exports = new AuditRepository();
