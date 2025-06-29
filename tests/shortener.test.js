const { MongoMemoryServer } = require('mongodb-memory-server');
const { connectDB, disconnectDB } = require('../db');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../index');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await connectDB(mongoServer.getUri());
});

afterAll(async () => {
  await disconnectDB();
  await mongoServer.stop();
});


describe('POST /shorten', () => {
  it('should create a short URL for a valid URL', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ longUrl: 'https://example.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.shortUrl).toMatch(/localhost:\d+\/[a-zA-Z0-9]+/);
  });

  it('should reject missing longUrl', async () => {
    const res = await request(app).post('/shorten').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Missing or invalid 'longUrl'");
  });

  it('should reject invalid URL format', async () => {
    const res = await request(app).post('/shorten').send({ longUrl: 'not-a-url' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid URL format');
  });

  it('should reject invalid expiresInDays', async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ longUrl: 'https://example.com', expiresInDays: -5 });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("'expiresInDays' must be a positive number");
  });
});

describe('GET /:code redirect', () => {
  let shortCode;

  beforeAll(async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ longUrl: 'https://redirect.com' });
    shortCode = res.body.shortUrl.split('/').pop();
  });

  it('should redirect for valid short code', async () => {
    const res = await request(app).get(`/${shortCode}`);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://redirect.com');
  });

  it('should return 400 for invalid short code format', async () => {
    const res = await request(app).get('/invalid-code!');
    expect(res.statusCode).toBe(400);
    expect(res.text).toBe('Invalid short code format');
  });

  it('should return 404 for non-existent short code', async () => {
    const res = await request(app).get('/abc999');
    expect(res.statusCode).toBe(404);
    expect(res.text).toBe('Short URL not found');
  });
});

describe('GET /stats/:code', () => {
  let shortCode;

  beforeAll(async () => {
    const res = await request(app)
      .post('/shorten')
      .send({ longUrl: 'https://stats.com' });
    shortCode = res.body.shortUrl.split('/').pop();
  });

  it('should return stats for valid code', async () => {
    const res = await request(app).get(`/stats/${shortCode}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('shortCode', shortCode);
    expect(res.body).toHaveProperty('longUrl', 'https://stats.com');
    expect(res.body).toHaveProperty('clicks');
    expect(res.body).toHaveProperty('expired', false);
  });

  it('should return 400 for invalid code format', async () => {
    const res = await request(app).get('/stats/invalid$code');
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid short code format');
  });

  it('should return 404 for non-existent code', async () => {
    const res = await request(app).get('/stats/abc999');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Short URL not found');
  });
});
