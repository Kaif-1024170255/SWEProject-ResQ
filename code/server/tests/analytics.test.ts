import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  Resource,
  ResourceInventory,
  RequestAssignment,
  Verification,
} from '../src/models';
import { getAnalyticsSummary } from '../src/services/analytics';
import { recordTelemetrySample, getTelemetryStats } from '../src/socket';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-analytics-tests';

function createAuthToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await RequestModel.syncIndexes();
  await Resource.syncIndexes();
  await ResourceInventory.syncIndexes();
  await RequestAssignment.syncIndexes();
  await Verification.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Resource.deleteMany({});
  await ResourceInventory.deleteMany({});
  await RequestAssignment.deleteMany({});
  await Verification.deleteMany({});
});

describe('Phase 4: Analytics Dashboard Proposal Metrics Service', () => {
  it('Metric 1: Time-to-Match should accurately compute median and mean minutes between verification and assignment', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const volunteer = await User.create({
      name: 'Volunteer',
      email: 'vol@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const now = Date.now();

    // Request 1: 30 minutes from verification to assignment
    const req1 = await RequestModel.create({
      requestId: 'REQ-TTM-01',
      category: 'medical',
      description: 'First aid needed',
      status: 'in_progress',
      location: {
        address: 'Sector 4',
        publicLat: 30.9,
        publicLng: 75.8,
        preciseLat: 30.9,
        preciseLng: 75.8,
      },
      statusHistory: [
        {
          status: 'verified',
          changedAt: new Date(now - 60 * 60 * 1000), // T - 60m
          changedBy: admin._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 30 * 60 * 1000), // T - 30m -> delta = 30m
          changedBy: volunteer._id,
        },
      ],
    });

    // Request 2: 50 minutes from verification to assignment
    const req2 = await RequestModel.create({
      requestId: 'REQ-TTM-02',
      category: 'supplies',
      description: 'Water filtration needed',
      status: 'in_progress',
      location: {
        address: 'Sector 5',
        publicLat: 30.91,
        publicLng: 75.81,
        preciseLat: 30.91,
        preciseLng: 75.81,
      },
      statusHistory: [
        {
          status: 'verified',
          changedAt: new Date(now - 120 * 60 * 1000), // T - 120m
          changedBy: admin._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 70 * 60 * 1000), // T - 70m -> delta = 50m
          changedBy: volunteer._id,
        },
      ],
    });

    const summary = await getAnalyticsSummary('7d');
    expect(summary.timeToMatch.totalEvaluated).toBe(2);
    // Median of [30, 50] is 50 (or 30 depending on index, here Math.floor(2/2) = 1 -> 50)
    expect([30, 50]).toContain(summary.timeToMatch.medianMinutes);
    expect(summary.timeToMatch.meanMinutes).toBe(40);
    expect(summary.timeToMatch.minMinutes).toBe(30);
    expect(summary.timeToMatch.maxMinutes).toBe(50);
  });

  it('Metric 2: Double-Booking Rate should confirm 0% on clean state and detect concurrent conflicts when simulated', async () => {
    const admin = await User.create({
      name: 'Admin',
      email: 'admin2@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const volunteer = await User.create({
      name: 'Volunteer',
      email: 'vol2@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const resource = await Resource.create({
      name: 'Rescue Boat',
      category: 'rescue',
      unit: 'boat',
      ownerId: admin._id,
    });

    const reqA = await RequestModel.create({
      requestId: 'REQ-DB-01',
      category: 'rescue',
      description: 'Flood evacuation A',
      status: 'in_progress',
      location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
    });

    const reqB = await RequestModel.create({
      requestId: 'REQ-DB-02',
      category: 'rescue',
      description: 'Flood evacuation B',
      status: 'in_progress',
      location: { publicLat: 30.91, publicLng: 75.81, preciseLat: 30.91, preciseLng: 75.81 },
    });

    // 1. Clean state: Single assignment of resource
    const assignment1 = await RequestAssignment.create({
      request: reqA._id,
      assignedTo: volunteer._id,
      assignedBy: admin._id,
      resource: resource._id,
      role: 'lead',
      status: 'assigned',
      assignedAt: new Date(),
    });

    let summary = await getAnalyticsSummary('7d');
    expect(summary.doubleBookingRate.totalEvaluated).toBe(1);
    expect(summary.doubleBookingRate.conflictCount).toBe(0);
    expect(summary.doubleBookingRate.ratePercentage).toBe(0.0);
    expect(summary.doubleBookingRate.status).toBe('INTEGRITY_VERIFIED');

    // 2. Simulated violation: Assigning the identical resource simultaneously to a second active request
    await RequestAssignment.create({
      request: reqB._id,
      assignedTo: volunteer._id,
      assignedBy: admin._id,
      resource: resource._id, // Collision!
      role: 'lead',
      status: 'assigned',
      assignedAt: new Date(),
    });

    summary = await getAnalyticsSummary('7d');
    expect(summary.doubleBookingRate.totalEvaluated).toBe(2);
    expect(summary.doubleBookingRate.conflictCount).toBe(1);
    expect(summary.doubleBookingRate.ratePercentage).toBe(50.0);
    expect(summary.doubleBookingRate.status).toBe('CONFLICT_DETECTED');
  });

  it('Metric 3: Confirmation Rate should compute percentage of resolved requests that reached closed via requester confirmation', async () => {
    // Request 1: Reached resolved and then confirmed closed
    await RequestModel.create({
      requestId: 'REQ-CONF-01',
      category: 'supplies',
      description: 'Delivered and confirmed',
      status: 'closed',
      location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
      statusHistory: [
        { status: 'resolved', changedAt: new Date(Date.now() - 30 * 60 * 1000) },
        { status: 'closed', changedAt: new Date(Date.now() - 10 * 60 * 1000) },
      ],
    });

    // Request 2: Reached resolved and still stuck in resolved
    await RequestModel.create({
      requestId: 'REQ-CONF-02',
      category: 'supplies',
      description: 'Delivered, awaiting confirm',
      status: 'resolved',
      location: { publicLat: 30.91, publicLng: 75.81, preciseLat: 30.91, preciseLng: 75.81 },
      statusHistory: [
        { status: 'resolved', changedAt: new Date(Date.now() - 20 * 60 * 1000) },
      ],
    });

    const summary = await getAnalyticsSummary('7d');
    expect(summary.confirmationRate.totalResolved).toBe(2);
    expect(summary.confirmationRate.confirmedClosed).toBe(1);
    expect(summary.confirmationRate.pendingConfirmation).toBe(1);
    expect(summary.confirmationRate.ratePercentage).toBe(50.0);
  });

  it('Metric 4: Propagation Latency telemetry should record samples and compute median and p95 metrics', () => {
    // Record synthetic round-trip latency samples: [20, 25, 30, 35, 100]
    [20, 25, 30, 35, 100].forEach((lat) => recordTelemetrySample(lat));

    const stats = getTelemetryStats();
    expect(stats.status).toBe('active');
    expect(stats.sampleCount).toBeGreaterThanOrEqual(5);
    expect(stats.minMs).toBeLessThanOrEqual(20);
    expect(stats.maxMs).toBeGreaterThanOrEqual(100);
    expect(stats.medianMs).toBeGreaterThan(0);
    expect(stats.p95Ms).toBeGreaterThan(stats.medianMs);
  });
});

describe('Phase 4: Analytics API Authorization & Security', () => {
  it('GET /api/analytics should enforce strict role restrictions (admin only)', async () => {
    const citizen = await User.create({
      name: 'Citizen',
      email: 'cit@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    const volunteer = await User.create({
      name: 'Volunteer',
      email: 'vol3@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const ngo = await User.create({
      name: 'NGO Lead',
      email: 'ngo3@resq.org',
      passwordHash: 'hash',
      role: 'ngo',
    });

    const admin = await User.create({
      name: 'Super Admin',
      email: 'admin3@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const citizenToken = createAuthToken(citizen._id.toString(), 'affected_person');
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');
    const ngoToken = createAuthToken(ngo._id.toString(), 'ngo');
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // 1. Anonymous request is rejected with 401
    const resAnon = await request(app).get('/api/analytics');
    expect(resAnon.status).toBe(401);

    // 2. Citizen is rejected with 403
    const resCit = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${citizenToken}`);
    expect(resCit.status).toBe(403);

    // 3. Volunteer is rejected with 403
    const resVol = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(resVol.status).toBe(403);

    // 4. NGO is rejected with 403 (analytics dashboard is strictly an admin feature)
    const resNgo = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${ngoToken}`);
    expect(resNgo.status).toBe(403);

    // 5. Admin succeeds with 200 and all 4 metrics
    const resAdmin = await request(app)
      .get('/api/analytics?timeRange=30d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.success).toBe(true);
    expect(resAdmin.body.data).toBeDefined();
    expect(resAdmin.body.data).toHaveProperty('timeToMatch');
    expect(resAdmin.body.data).toHaveProperty('doubleBookingRate');
    expect(resAdmin.body.data).toHaveProperty('confirmationRate');
    expect(resAdmin.body.data).toHaveProperty('propagationLatency');
    expect(resAdmin.body.data.timeRange).toBe('30d');
  });
});
