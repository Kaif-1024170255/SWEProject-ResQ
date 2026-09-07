import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { User, Request as RequestModel } from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-requests-tests';

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await RequestModel.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
});

describe('POST /api/requests (Emergency Request Submission)', () => {
  it('should accept a public emergency request and return requestId and confirmation', async () => {
    const res = await request(app).post('/api/requests').send({
      category: 'medical',
      description: 'Senior citizen in critical need of cardiac medication, ground floor flooded',
      preciseLat: 30.901,
      preciseLng: 75.8573,
      contactPhone: '+91 98765 00000',
    });

    expect(res.status).toBe(201);
    expect(res.body.requestId).toMatch(/^REQ-\d{4}-\d{6}$/);
    expect(res.body.message).toContain('Your request has been logged as');
    expect(res.body.message).toContain("A volunteer or NGO will be able to see it once it's verified.");

    // Verify coordinates in returned object are public only
    expect(res.body.request.location.publicLat).toBeDefined();
    expect(res.body.request.location.publicLng).toBeDefined();
    expect(res.body.request.location.preciseLat).toBeUndefined();
    expect(res.body.request.location.preciseLng).toBeUndefined();
    expect(res.body.request.status).toBe('unverified');
  });

  it('should reject submission with missing category', async () => {
    const res = await request(app).post('/api/requests').send({
      description: 'Needs food',
      preciseLat: 30.901,
      preciseLng: 75.8573,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  it('should reject submission with invalid category', async () => {
    const res = await request(app).post('/api/requests').send({
      category: 'entertainment',
      description: 'Needs help',
      preciseLat: 30.901,
      preciseLng: 75.8573,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid category/i);
  });

  it('should reject submission with invalid coordinates', async () => {
    const res = await request(app).post('/api/requests').send({
      category: 'rescue',
      description: 'Needs rescue',
      preciseLat: 150, // Invalid latitude (> 90)
      preciseLng: 75.8573,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid coordinates/i);
  });
});

describe('GET /api/requests (Public Requests List)', () => {
  beforeEach(async () => {
    // Seed 2 requests
    await RequestModel.create([
      {
        category: 'medical',
        description: 'First aid needed',
        location: { preciseLat: 30.9, preciseLng: 75.85 },
        status: 'unverified',
      },
      {
        category: 'supplies',
        description: 'Clean drinking water',
        location: { preciseLat: 30.91, preciseLng: 75.86 },
        status: 'verified',
      },
    ]);
  });

  it('should NEVER leak precise coordinates in public list', async () => {
    const res = await request(app).get('/api/requests');

    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(2);

    for (const item of res.body.requests) {
      expect(item.location.publicLat).toBeDefined();
      expect(item.location.publicLng).toBeDefined();
      expect(item.location.preciseLat).toBeUndefined();
      expect(item.location.preciseLng).toBeUndefined();
    }
  });

  it('should filter requests by status', async () => {
    const res = await request(app).get('/api/requests?status=verified');

    expect(res.status).toBe(200);
    expect(res.body.requests.length).toBe(1);
    expect(res.body.requests[0].category).toBe('supplies');
  });
});

describe('GET /api/requests/:id (Privacy Rules for Single Request)', () => {
  let sampleRequest: any;
  let adminToken: string;
  let volunteerClaimantToken: string;
  let otherUserToken: string;

  beforeEach(async () => {
    const adminUser = await User.create({
      name: 'Dispatch Admin',
      email: 'admin.test@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });
    adminToken = jwt.sign(
      { userId: adminUser._id.toString(), role: 'admin' },
      TEST_JWT_SECRET
    );

    const claimantUser = await User.create({
      name: 'Claimant Volunteer',
      email: 'claimant@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });
    volunteerClaimantToken = jwt.sign(
      { userId: claimantUser._id.toString(), role: 'volunteer' },
      TEST_JWT_SECRET
    );

    const bystanderUser = await User.create({
      name: 'Unrelated Volunteer',
      email: 'bystander@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });
    otherUserToken = jwt.sign(
      { userId: bystanderUser._id.toString(), role: 'volunteer' },
      TEST_JWT_SECRET
    );

    sampleRequest = await RequestModel.create({
      category: 'rescue',
      description: 'Family stranded on rooftop',
      location: { preciseLat: 30.908, preciseLng: 75.854 },
      status: 'in_progress',
      claimedBy: claimantUser._id,
    });
  });

  it('should hide precise coordinates from unauthenticated public request', async () => {
    const res = await request(app).get(`/api/requests/${sampleRequest.requestId}`);

    expect(res.status).toBe(200);
    expect(res.body.isPreciseLocationRevealed).toBe(false);
    expect(res.body.request.location.publicLat).toBeDefined();
    expect(res.body.request.location.preciseLat).toBeUndefined();
    expect(res.body.request.location.preciseLng).toBeUndefined();
  });

  it('should hide precise coordinates from unrelated volunteer', async () => {
    const res = await request(app)
      .get(`/api/requests/${sampleRequest.requestId}`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isPreciseLocationRevealed).toBe(false);
    expect(res.body.request.location.preciseLat).toBeUndefined();
  });

  it('should reveal precise coordinates to administrator', async () => {
    const res = await request(app)
      .get(`/api/requests/${sampleRequest.requestId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isPreciseLocationRevealed).toBe(true);
    expect(res.body.request.location.preciseLat).toBe(30.908);
    expect(res.body.request.location.preciseLng).toBe(75.854);
  });

  it('should reveal precise coordinates to claimant', async () => {
    const res = await request(app)
      .get(`/api/requests/${sampleRequest.requestId}`)
      .set('Authorization', `Bearer ${volunteerClaimantToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isPreciseLocationRevealed).toBe(true);
    expect(res.body.request.location.preciseLat).toBe(30.908);
    expect(res.body.request.location.preciseLng).toBe(75.854);
  });
});
