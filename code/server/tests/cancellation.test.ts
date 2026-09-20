import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  Notification,
  Resource,
  ResourceInventory,
  RequestResource,
  RequestAssignment,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-cancellation-tests';

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
  await Notification.syncIndexes();
  await Resource.syncIndexes();
  await ResourceInventory.syncIndexes();
  await RequestResource.syncIndexes();
  await RequestAssignment.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Notification.deleteMany({});
  await Resource.deleteMany({});
  await ResourceInventory.deleteMany({});
  await RequestResource.deleteMany({});
  await RequestAssignment.deleteMany({});
});

describe('Request Cancellation & Withdrawal Lifecycle (Option A)', () => {
  it('should allow the authenticated creator to withdraw an unverified or verified request', async () => {
    const requester = await User.create({
      name: 'Sunita Requester',
      email: 'sunita@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const requesterToken = createAuthToken(requester._id.toString(), requester.role, requester.name);

    // 1. Unverified request
    const unverifiedReq = await RequestModel.create({
      requestId: 'REQ-TEST-UNVERIFIED',
      category: 'supplies',
      description: 'Need tarpaulin sheets',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'unverified',
      createdBy: requester._id,
    });

    const cancelRes = await request(app)
      .patch(`/api/requests/${unverifiedReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ reason: 'Neighbor provided tarpaulin' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.request.status).toBe('cancelled');

    const refreshed = await RequestModel.findOne({ requestId: unverifiedReq.requestId });
    expect(refreshed?.status).toBe('cancelled');
    expect(refreshed?.statusHistory.some((h) => h.status === 'cancelled' && h.note?.includes('tarpaulin'))).toBe(true);

    // 2. Verified request
    const verifiedReq = await RequestModel.create({
      requestId: 'REQ-TEST-VERIFIED',
      category: 'medical',
      description: 'First aid bandage needed',
      location: { preciseLat: 28.62, preciseLng: 77.24, publicLat: 28.62, publicLng: 77.24 },
      status: 'verified',
      createdBy: requester._id,
    });

    const cancelVerifiedRes = await request(app)
      .patch(`/api/requests/${verifiedReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ reason: 'Minor injury treated at local clinic' });

    expect(cancelVerifiedRes.status).toBe(200);
    expect(cancelVerifiedRes.body.request.status).toBe('cancelled');
  });

  it('should allow withdrawal during in_progress, releasing reserved stock and standing down assignments', async () => {
    const requester = await User.create({
      name: 'Aman Requester',
      email: 'aman@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const responder = await User.create({
      name: 'Ravi Responder',
      email: 'ravi@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const provider = await User.create({
      name: 'Food Depot',
      email: 'depot@example.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });

    const requesterToken = createAuthToken(requester._id.toString(), requester.role, requester.name);

    // Create resource & inventory
    const resource = await Resource.create({
      name: 'Clean Water Can (20L)',
      category: 'water',
      unit: 'cans',
      ownerType: 'User',
      ownerId: provider._id,
    });

    const inventory = await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: provider._id,
      quantityAvailable: 10,
      quantityReserved: 5,
    });

    // In-progress request with allocation and assignment
    const activeReq = await RequestModel.create({
      requestId: 'REQ-ACTIVE-001',
      category: 'supplies',
      description: 'Urgent water cans needed for shelter',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'in_progress',
      createdBy: requester._id,
      claimedBy: responder._id,
    });

    await RequestResource.create({
      request: activeReq._id,
      resource: resource._id,
      quantityRequested: 5,
      quantityAllocated: 5,
      status: 'fully_allocated',
    });

    const assignment = await RequestAssignment.create({
      request: activeReq._id,
      assignedTo: responder._id,
      assignedBy: responder._id,
      role: 'lead',
      status: 'assigned',
      assignedAt: new Date(),
    });

    // Requester withdraws request
    const cancelRes = await request(app)
      .patch(`/api/requests/${activeReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ reason: 'Water tankers arrived from municipal authority' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.request.status).toBe('cancelled');

    // Verify reserved inventory was released back to depot
    const refreshedInventory = await ResourceInventory.findById(inventory._id);
    expect(refreshedInventory?.quantityReserved).toBe(0);
    expect(refreshedInventory?.quantityAvailable).toBe(15);

    // Verify assignment stood down
    const refreshedAssignment = await RequestAssignment.findById(assignment._id);
    expect(refreshedAssignment?.status).toBe('cancelled');

    // Verify responder received standing-down notification
    const responderNotifs = await Notification.find({ recipient: responder._id });
    expect(responderNotifs.length).toBe(1);
    expect(responderNotifs[0].title).toContain('Request Withdrawn');
  });

  it('should allow anonymous requesters to withdraw via contact phone matching', async () => {
    const anonReq = await RequestModel.create({
      requestId: 'REQ-ANON-001',
      category: 'rescue',
      description: 'Stranded on porch due to rising water',
      contactPhone: '+91 98765 43210',
      location: { preciseLat: 19.076, preciseLng: 72.877, publicLat: 19.076, publicLng: 72.877 },
      status: 'unverified',
    });

    // Wrong phone number -> 403 Forbidden
    const wrongPhoneRes = await request(app)
      .patch(`/api/requests/${anonReq.requestId}/cancel`)
      .send({
        contactPhone: '99999 00000',
        reason: 'Safe now',
      });

    expect(wrongPhoneRes.status).toBe(403);
    expect(wrongPhoneRes.body.error).toContain('Access denied');

    // Matching phone number -> 200 OK
    const matchingPhoneRes = await request(app)
      .patch(`/api/requests/${anonReq.requestId}/cancel`)
      .send({
        contactPhone: '9876543210',
        reason: 'Water receded, walked to safety',
      });

    expect(matchingPhoneRes.status).toBe(200);
    expect(matchingPhoneRes.body.request.status).toBe('cancelled');

    const refreshed = await RequestModel.findOne({ requestId: anonReq.requestId });
    expect(refreshed?.status).toBe('cancelled');
  });

  it('should allow administrators to cancel at any point before closed, while blocking unrelated volunteers', async () => {
    const admin = await User.create({
      name: 'Admin Desk',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const unrelatedVolunteer = await User.create({
      name: 'Other Volunteer',
      email: 'other@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);
    const volunteerToken = createAuthToken(unrelatedVolunteer._id.toString(), unrelatedVolunteer.role, unrelatedVolunteer.name);

    const testReq = await RequestModel.create({
      requestId: 'REQ-ADMIN-TEST',
      category: 'medical',
      description: 'Oxygen cylinder needed',
      contactPhone: '9123456789',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'verified',
    });

    // Unrelated volunteer tries to cancel -> 403
    const volCancel = await request(app)
      .patch(`/api/requests/${testReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ reason: 'Not real' });

    expect(volCancel.status).toBe(403);
    expect(volCancel.body.error).toContain('Access denied');

    // Admin cancels -> 200
    const adminCancel = await request(app)
      .patch(`/api/requests/${testReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Duplicate report confirmed with district hospital' });

    expect(adminCancel.status).toBe(200);
    expect(adminCancel.body.request.status).toBe('cancelled');

    // Attempting to cancel again once already cancelled -> 400
    const secondCancel = await request(app)
      .patch(`/api/requests/${testReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Cancelling again' });

    expect(secondCancel.status).toBe(400);
    expect(secondCancel.body.error).toContain('already cancelled');
  });

  it('should confirm existing resolve and confirm flow for non-cancelled requests is unaffected', async () => {
    const requester = await User.create({
      name: 'Citizen Meena',
      email: 'meena@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const responder = await User.create({
      name: 'Responder Baljit',
      email: 'baljit@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const requesterToken = createAuthToken(requester._id.toString(), requester.role, requester.name);
    const responderToken = createAuthToken(responder._id.toString(), responder.role, responder.name);

    // Standard in-progress request
    const standardReq = await RequestModel.create({
      requestId: 'REQ-STANDARD-001',
      category: 'rescue',
      description: 'Evacuation of elderly resident',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'in_progress',
      createdBy: requester._id,
      claimedBy: responder._id,
    });

    // 1. Responder resolves
    const resolveRes = await request(app)
      .patch(`/api/requests/${standardReq.requestId}/resolve`)
      .set('Authorization', `Bearer ${responderToken}`)
      .send({ note: 'Evacuation successfully completed to shelter' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.request.status).toBe('resolved');

    // 2. Requester confirms resolution and closes ticket
    const confirmRes = await request(app)
      .patch(`/api/requests/${standardReq.requestId}/confirm`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ note: 'Safe at shelter. Thank you team!' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.request.status).toBe('closed');

    // 3. Trying to cancel closed request -> 400
    const cancelClosed = await request(app)
      .patch(`/api/requests/${standardReq.requestId}/cancel`)
      .set('Authorization', `Bearer ${requesterToken}`);

    expect(cancelClosed.status).toBe(400);
    expect(cancelClosed.body.error).toContain('already closed');
  });
});
