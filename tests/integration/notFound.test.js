const request = require('supertest');
const app = require('../../backend/src/app');

describe('404 Not Found Handling', () => {
  test('should return standard JSON error for unknown API routes', async () => {
    const response = await request(app)
      .get('/api/v1/unknown-endpoint-xyz')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.body.error).toHaveProperty('message');
    expect(response.body.error.message).toContain('Route GET /api/v1/unknown-endpoint-xyz not found');
  });

  test('should return 404 for nonexistent non-API routes', async () => {
    await request(app)
      .get('/nonexistent-page-asset.xyz')
      .expect(404);
  });
});
