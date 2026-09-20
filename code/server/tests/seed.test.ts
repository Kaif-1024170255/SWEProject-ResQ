import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app';
import { seedDatabase } from '../src/seed';
import {
  User,
  Request,
  Organization,
  Resource,
  ResourceInventory,
  RequestResource,
  RequestAssignment,
  Verification,
  Notification,
  Message,
  Evidence,
  Incident,
  EmergencyCategory,
} from '../src/models';

describe('Seed Script & End-to-End Phase 1 Integration Validation', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-super-secret-jwt-key-for-unit-testing';
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should seed all collections with the rich expanded dataset', async () => {
    const seedResult = await seedDatabase();

    // 1. Users
    expect(seedResult.users.length).toBeGreaterThanOrEqual(5);
    const adminUser = await User.findOne({ role: 'admin' });
    const volunteerUser = await User.findOne({ role: 'volunteer' });
    expect(adminUser).not.toBeNull();
    expect(volunteerUser).not.toBeNull();

    // 2. Organizations (2 or 3)
    const orgs = await Organization.find();
    expect(orgs.length).toBeGreaterThanOrEqual(3);
    expect(orgs.some((o) => o.type === 'ngo')).toBe(true);
    expect(orgs.some((o) => o.type === 'supplier')).toBe(true);
    expect(orgs.some((o) => o.type === 'community_group')).toBe(true);

    // 3. Resources & Inventory
    const resources = await Resource.find();
    expect(resources.length).toBeGreaterThanOrEqual(4);
    const inventories = await ResourceInventory.find();
    expect(inventories.length).toBeGreaterThanOrEqual(4);

    // 4. Requests, RequestResources & RequestAssignments
    const requests = await Request.find();
    expect(requests.length).toBeGreaterThanOrEqual(10);
    const reqResources = await RequestResource.find();
    expect(reqResources.length).toBeGreaterThanOrEqual(3);
    const assignments = await RequestAssignment.find();
    expect(assignments.length).toBeGreaterThanOrEqual(2);

    // 5. Verification records for verified requests
    const verifications = await Verification.find();
    expect(verifications.length).toBeGreaterThanOrEqual(2);
    for (const v of verifications) {
      expect(['verified_legitimate', 'duplicate']).toContain(v.result);
      expect(v.verifiedBy).toBeDefined();
    }

    // 6. Notifications
    const notifications = await Notification.find();
    expect(notifications.length).toBeGreaterThanOrEqual(4);
    expect(notifications.some((n) => n.type === 'request_verified')).toBe(true);
    expect(notifications.some((n) => n.type === 'request_claimed')).toBe(true);
    expect(notifications.some((n) => n.type === 'new_message')).toBe(true);

    // 7. Message thread on at least one request
    const messages = await Message.find();
    expect(messages.length).toBeGreaterThanOrEqual(3);
    const messageRequestIds = new Set(messages.map((m) => m.request.toString()));
    expect(messageRequestIds.size).toBeGreaterThanOrEqual(1);

    // 8. Evidence metadata on at least one request
    const evidenceItems = await Evidence.find();
    expect(evidenceItems.length).toBeGreaterThanOrEqual(1);
    expect(evidenceItems[0].fileUrl).toBeDefined();
    expect(evidenceItems[0].fileName).toBeDefined();

    // 9. Incidents grouping multiple requests
    const incidents = await Incident.find();
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    expect(incidents[0].requests.length).toBeGreaterThanOrEqual(2);

    // 10. EmergencyCategory documents (default 5 + custom)
    const categories = await EmergencyCategory.find();
    expect(categories.length).toBeGreaterThanOrEqual(5);
    const categoryNames = categories.map((c) => c.name);
    expect(categoryNames).toContain('medical');
    expect(categoryNames).toContain('shelter');
    expect(categoryNames).toContain('supplies');
    expect(categoryNames).toContain('rescue');
    expect(categoryNames).toContain('other');
  });

  it('manually executes the full Phase 1 demo scenario: submit -> verify -> claim -> resolve -> confirm', async () => {
    // Authenticate users
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@resq.org', password: 'ResQSecure2026!' });
    expect(adminRes.status).toBe(200);
    const adminToken = adminRes.body.token;

    const volunteerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rahul.volunteer@example.org', password: 'ResQSecure2026!' });
    expect(volunteerRes.status).toBe(200);
    const volunteerToken = volunteerRes.body.token;

    const callerPhone = '+91 98888 12345';

    // Step 1: Submit a new emergency request (anonymous bystander / citizen)
    const submitRes = await request(app)
      .post('/api/requests')
      .send({
        category: 'medical',
        description: 'Citizen injured during basement water evacuation, urgent suture kit needed',
        preciseLat: 30.9020,
        preciseLng: 75.8560,
        contactPhone: callerPhone,
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.requestId).toBeDefined();
    expect(submitRes.body.request.status).toBe('unverified');
    const customRequestId = submitRes.body.requestId;
    const createdReqId = submitRes.body.request._id;

    // Step 2: Verify the request (as Admin) with remarks
    const verifyRes = await request(app)
      .patch(`/api/requests/${customRequestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Field dispatch confirmed', remarks: 'Verified by Sector 4 quick-response coordinator.' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.request.status).toBe('verified');
    // Check that StatusHistory and Verification entity were both created
    const verifiedDoc = await Request.findById(createdReqId);
    expect(verifiedDoc?.statusHistory.some((s) => s.status === 'verified')).toBe(true);
    const verificationRecord = await Verification.findOne({ request: createdReqId });
    expect(verificationRecord).not.toBeNull();
    expect(verificationRecord?.remarks).toBe('Verified by Sector 4 quick-response coordinator.');

    // Step 3: Claim the request (as Volunteer)
    const claimRes = await request(app)
      .patch(`/api/requests/${customRequestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Volunteer en route' });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.request.status).toBe('in_progress');
    // Check that RequestAssignment was automatically created in the background
    const assignmentRecord = await RequestAssignment.findOne({ request: createdReqId });
    expect(assignmentRecord).not.toBeNull();
    expect(assignmentRecord?.assignedTo.toString()).toBe(volunteerRes.body.user.id);

    // Step 4: Resolve the request (as Volunteer)
    const resolveRes = await request(app)
      .patch(`/api/requests/${customRequestId}/resolve`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Suture kit delivered and medical care administered by local volunteer nurse.' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.request.status).toBe('resolved');

    // Step 5: Confirm resolution (as requester via phone number check)
    const confirmRes = await request(app)
      .patch(`/api/requests/${customRequestId}/confirm`)
      .send({ contactPhone: callerPhone, note: 'Safe and grateful' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.request.status).toBe('closed');

    // Verify final state in database
    const finalDoc = await Request.findById(createdReqId);
    expect(finalDoc?.status).toBe('closed');
    expect(finalDoc?.statusHistory.length).toBe(5); // unverified -> verified -> in_progress -> resolved -> closed
  });
});
