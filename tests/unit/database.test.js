const { getPool, checkConnection, closePool } = require('../../backend/src/config/database');

describe('Database Configuration & Connectivity Unit Tests', () => {
  afterAll(async () => {
    await closePool();
  });

  test('checkConnection should return connection status object gracefully when DATABASE_URL is not set or unavailable', async () => {
    const status = await checkConnection();
    expect(status).toBeDefined();
    expect(typeof status.connected).toBe('boolean');
    if (!status.connected) {
      expect(status.message).toBeDefined();
    }
  });

  test('getPool should return null or Pool instance without throwing unhandled exceptions', () => {
    expect(() => {
      const pool = getPool();
      // either null or an object with query function
      if (pool) {
        expect(typeof pool.query).toBe('function');
      }
    }).not.toThrow();
  });
});
