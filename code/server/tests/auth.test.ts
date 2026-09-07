import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { User } from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-super-secret-jwt-key-for-unit-testing';

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('POST /api/auth/register', () => {
  it('should register a new volunteer successfully and return a JWT', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Pooja Verma',
      email: 'pooja.volunteer@example.org',
      password: 'SecurePassword123!',
      role: 'volunteer',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('Pooja Verma');
    expect(res.body.user.email).toBe('pooja.volunteer@example.org');
    expect(res.body.user.role).toBe('volunteer');
    expect(res.body.user.passwordHash).toBeUndefined();

    // Verify token content
    const decoded = jwt.verify(res.body.token, TEST_JWT_SECRET) as {
      userId: string;
      role: string;
    };
    expect(decoded.userId).toBe(res.body.user.id);
    expect(decoded.role).toBe('volunteer');
  });

  it('should reject registration with role "admin" with 403 Forbidden', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Malicious Admin Wannabe',
      email: 'hacker@example.org',
      password: 'SecurePassword123!',
      role: 'admin',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Admin registration is not permitted/i);

    // Verify user was not saved
    const found = await User.findOne({ email: 'hacker@example.org' });
    expect(found).toBeNull();
  });

  it('should reject registration if email already exists with 409 Conflict', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Original User',
      email: 'duplicate@example.org',
      password: 'Password123!',
      role: 'affected_person',
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Imposter User',
      email: 'duplicate@example.org',
      password: 'DifferentPassword123!',
      role: 'volunteer',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('should reject registration if password is too short', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Short PW',
      email: 'short@example.org',
      password: '123',
      role: 'volunteer',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Register a known user
    await request(app).post('/api/auth/register').send({
      name: 'Registered Volunteer',
      email: 'volunteer.login@example.org',
      password: 'CorrectPassword123!',
      role: 'volunteer',
    });
  });

  it('should authenticate valid credentials and return a JWT', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'volunteer.login@example.org',
      password: 'CorrectPassword123!',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('volunteer.login@example.org');
    expect(res.body.user.role).toBe('volunteer');
  });

  it('should reject login with invalid password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'volunteer.login@example.org',
      password: 'WrongPassword!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/i);
  });

  it('should reject login with non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@example.org',
      password: 'AnyPassword123!',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/i);
  });
});

describe('Middleware: requireAuth & requireRole', () => {
  let volunteerToken: string;
  let adminToken: string;

  beforeEach(async () => {
    // 1. Create a volunteer
    const volRes = await request(app).post('/api/auth/register').send({
      name: 'Field Volunteer',
      email: 'field.vol@example.org',
      password: 'Password123!',
      role: 'volunteer',
    });
    volunteerToken = volRes.body.token;

    // 2. Direct seed of an admin user in DB (since admin cannot self-register)
    const adminUser = await User.create({
      name: 'System Admin',
      email: 'admin.super@example.org',
      passwordHash: 'seeded_hash',
      role: 'admin',
    });

    adminToken = jwt.sign(
      { userId: adminUser._id.toString(), role: 'admin' },
      TEST_JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  it('GET /api/auth/me should return profile when authenticated with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('field.vol@example.org');
    expect(res.body.user.role).toBe('volunteer');
  });

  it('GET /api/auth/me should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/No token provided/i);
  });

  it('GET /api/auth/me should return 401 when an invalid token is provided', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-garbage-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid or expired token/i);
  });

  it('GET /api/admin/overview should reject non-admin with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${volunteerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/is not authorized/i);
  });

  it('GET /api/admin/overview should permit admin user with 200 OK', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
