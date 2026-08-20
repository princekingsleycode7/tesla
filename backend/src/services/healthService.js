const { checkConnection } = require('../config/database');

/**
 * Health Service
 */
async function getHealthStatus() {
  const dbHealth = await checkConnection();

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealth.connected ? 'connected' : 'disconnected'
  };
}

module.exports = {
  getHealthStatus
};
