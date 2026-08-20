const request = require('supertest');
const app = require('../../backend/src/app');

describe('GET /api/v1/health Endpoint', () => {
  test('should return 200 OK with standard health response format', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'healthy'
      }
    });
  });

  test('should return 200 OK with detailed diagnostics on /api/v1/health/detailed', async () => {
    const response = await request(app)
      .get('/api/v1/health/detailed')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.status).toBe('healthy');
    expect(response.body.data.uptime).toBeDefined();
    expect(response.body.data.timestamp).toBeDefined();
    expect(response.body.data.database).toBeDefined();
  });
});
