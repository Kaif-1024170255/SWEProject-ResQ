import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  EmergencyCategory,
  Incident,
  seedDefaultCategories,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-categories-incidents-tests';

function createAuthToken(userId: string, role: string, name?: string): string {
  return jwt.sign({ userId, role, name }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await RequestModel.syncIndexes();
  await EmergencyCategory.syncIndexes();
  await Incident.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await EmergencyCategory.deleteMany({});
  await Incident.deleteMany({});
});

describe('EmergencyCategory Entity & Backward Compatibility', () => {
  it('should seed the 5 existing default categories and allow end-to-end request creation with them', async () => {
    // 1. Seed categories
    await seedDefaultCategories();

    // 2. Fetch categories via API
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);

    const names = res.body.categories.map((c: any) => c.name);
    expect(names).toContain('medical');
    expect(names).toContain('shelter');
    expect(names).toContain('supplies');
    expect(names).toContain('rescue');
    expect(names).toContain('other');

    // 3. Confirm all 5 existing category values still work for creating emergency requests
    for (const catName of ['medical', 'shelter', 'supplies', 'rescue', 'other']) {
      const createRes = await request(app)
        .post('/api/requests')
        .send({
          category: catName,
          description: `Test request for category ${catName}`,
          preciseLat: 28.6139,
          preciseLng: 77.209,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.request.category).toBe(catName);
    }
  });

  it('should allow admin to create and update new categories, while forbidding non-admins', async () => {
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const volunteer = await User.create({
      name: 'Rohan Volunteer',
      email: 'rohan@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);
    const volunteerToken = createAuthToken(volunteer._id.toString(), volunteer.role, volunteer.name);

    // Non-admin attempt to create category -> 403
    const nonAdminRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        name: 'power_outage',
        label: 'Electrical Grid Failure',
        description: 'Blackout affecting medical equipment and refrigeration',
        priority_level: 'critical',
      });

    expect(nonAdminRes.status).toBe(403);

    // Admin creates new category -> 201
    const adminCreateRes = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'power_outage',
        label: 'Electrical Grid Failure',
        description: 'Blackout affecting medical equipment and refrigeration',
        priority_level: 'critical',
      });

    expect(adminCreateRes.status).toBe(201);
    expect(adminCreateRes.body.category.name).toBe('power_outage');

    // Submit a request with the newly created category -> 201
    const reqWithNewCat = await request(app)
      .post('/api/requests')
      .send({
        category: 'power_outage',
        description: 'Generator fuel depleted at elderly home',
        preciseLat: 28.62,
        preciseLng: 77.22,
      });

    expect(reqWithNewCat.status).toBe(201);
    expect(reqWithNewCat.body.request.category).toBe('power_outage');
  });
});

describe('Incident Entity & Grouped Request Management', () => {
  it('should allow admin to create an incident, link requests, and retrieve grouped requests', async () => {
    const admin = await User.create({
      name: 'District Collector Admin',
      email: 'collector@resq.gov',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);

    // 1. Create three separate emergency requests
    const req1 = await RequestModel.create({
      requestId: 'REQ-FLOOD-001',
      category: 'rescue',
      description: 'Family stranded on rooftop in Sector 4',
      location: { preciseLat: 30.901, preciseLng: 75.85, publicLat: 30.901, publicLng: 75.85 },
      status: 'verified',
    });
    const req2 = await RequestModel.create({
      requestId: 'REQ-FLOOD-002',
      category: 'medical',
      description: 'Dialysis patient without power',
      location: { preciseLat: 30.905, preciseLng: 75.855, publicLat: 30.905, publicLng: 75.855 },
      status: 'in_progress',
    });
    const req3 = await RequestModel.create({
      requestId: 'REQ-FLOOD-003',
      category: 'supplies',
      description: 'Potable water exhausted at relief camp',
      location: { preciseLat: 30.91, preciseLng: 75.86, publicLat: 30.91, publicLng: 75.86 },
      status: 'unverified',
    });

    // 2. Admin creates an Incident linking the first two requests initially
    const createIncRes = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Ghaggar River Basin Monsoon Overflow',
        description: 'Flash flooding across Sectors 3-6 following 150mm rainfall',
        severity: 'critical',
        location: {
          description: 'Sector 4 Lowland Basin, Ludhiana',
          lat: 30.905,
          lng: 75.855,
          radiusKm: 5,
        },
        requestIds: [req1.requestId, req2.requestId],
      });

    expect(createIncRes.status).toBe(201);
    expect(createIncRes.body.incident.incidentId).toBeDefined();
    expect(createIncRes.body.incident.name).toBe('Ghaggar River Basin Monsoon Overflow');
    expect(createIncRes.body.incident.requests.length).toBe(2);

    const incidentId = createIncRes.body.incident.incidentId;

    // 3. Admin links the third request to the incident
    const linkRes = await request(app)
      .post(`/api/incidents/${incidentId}/requests`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        requestIds: [req3.requestId],
      });

    expect(linkRes.status).toBe(200);
    expect(linkRes.body.linkedCount).toBe(1);

    // 4. Retrieve all requests grouped under this incident
    const groupedRes = await request(app)
      .get(`/api/incidents/${incidentId}/requests`);

    expect(groupedRes.status).toBe(200);
    expect(groupedRes.body.count).toBe(3);
    expect(groupedRes.body.incidentId).toBe(incidentId);

    const returnedRequestIds = groupedRes.body.requests.map((r: any) => r.requestId);
    expect(returnedRequestIds).toContain('REQ-FLOOD-001');
    expect(returnedRequestIds).toContain('REQ-FLOOD-002');
    expect(returnedRequestIds).toContain('REQ-FLOOD-003');

    // 5. List all incidents
    const listIncRes = await request(app).get('/api/incidents');
    expect(listIncRes.status).toBe(200);
    expect(listIncRes.body.count).toBe(1);
    expect(listIncRes.body.incidents[0].name).toBe('Ghaggar River Basin Monsoon Overflow');
  });
});
