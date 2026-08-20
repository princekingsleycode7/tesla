const request = require('supertest');
const app = require('../../backend/src/app');

describe('Existing Frontend Availability & Asset Serving', () => {
  test('GET / should serve index.html with 200 OK', async () => {
    const response = await request(app)
      .get('/')
      .expect(200);

    expect(response.text).toContain('Tesla, Inc. — Invest in the Electric Future');
    expect(response.text).toContain('nk-hero');
    expect(response.text).toContain('menu-toggle');
  });

  test('GET /v2 should serve v2.html with 200 OK', async () => {
    const response = await request(app)
      .get('/v2')
      .expect(200);

    expect(response.text).toContain('Tesla, Inc.');
  });

  test('GET /AI.mp4 should serve video file with video/mp4 content type', async () => {
    await request(app)
      .get('/AI.mp4')
      .expect('Content-Type', /video\/mp4/)
      .expect(200);
  });

  test('GET /tesla.jfif should serve vehicle image with 200 OK', async () => {
    await request(app)
      .get('/tesla.jfif')
      .expect(200);
  });

  test('GET /elon.jfif should serve portrait image with 200 OK', async () => {
    await request(app)
      .get('/elon.jfif')
      .expect(200);
  });

  test('GET /site.webmanifest should serve web manifest', async () => {
    const response = await request(app)
      .get('/site.webmanifest')
      .expect(200);

    expect(response.text).toContain('Tesla, Inc.');
  });
});
