const request = require('supertest');
const express = require('express');
const errorHandler = require('../../backend/src/middleware/errorHandler');

describe('Central Error Handler', () => {
  let errorTestApp;

  beforeAll(() => {
    errorTestApp = express();
    errorTestApp.use(express.json());

    // Route that throws custom error
    errorTestApp.get('/test-error', (req, res, next) => {
      const err = new Error('Test custom failure');
      err.statusCode = 400;
      err.code = 'INVALID_INPUT';
      next(err);
    });

    // Route that throws unhandled 500 error
    errorTestApp.get('/test-server-error', (req, res, next) => {
      const err = new Error('Unexpected database failure');
      next(err);
    });

    errorTestApp.use(errorHandler);
  });

  test('should format client errors with appropriate status and error code', async () => {
    const response = await request(errorTestApp)
      .get('/test-error')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_INPUT',
        message: 'Test custom failure'
      })
    }));
  });

  test('should format unhandled server errors as 500 with default code', async () => {
    const response = await request(errorTestApp)
      .get('/test-server-error')
      .expect('Content-Type', /json/)
      .expect(500);

    expect(response.body).toEqual(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected database failure'
      })
    }));
  });
});
