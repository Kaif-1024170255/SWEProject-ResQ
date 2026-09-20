import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  Verification,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-verification-tests';

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
  await Verification.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Verification.deleteMany({});
});

describe('Verification Entity Integration', () => {
  it('should create both a StatusHistory entry and a Verification record when remarks are provided', async () => {
    // 1. Create admin user
    const admin = await User.create({
      name: 'Verification Admin',
      email: 'admin.verify@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // 2. Submit an emergency request
    const subRes = await request(app).post('/api/requests').send({
      category: 'medical',
      description: 'Dialysis patient needs transport to functioning clinic',
      preciseLat: 30.901,
      preciseLng: 75.8573,
      contactPhone: '+91 98888 12345',
    });
    const requestId = subRes.body.requestId;

    // 3. Admin verifies with explicit remarks
    const verifyRemarks = 'Contacted caller Mrs. Kaur; verified medical prescription and urgent dialysis appointment at 4 PM.';
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        remarks: verifyRemarks,
        method: 'phone_call',
        result: 'verified_legitimate',
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.request.status).toBe('verified');
    expect(verifyRes.body.message).toContain('has been verified');

    // 4. Confirm StatusHistory entry was created and updated
    const reqDoc = await RequestModel.findOne({ requestId });
    expect(reqDoc).toBeDefined();
    const verifiedHistory = reqDoc?.statusHistory.find((h) => h.status === 'verified');
    expect(verifiedHistory).toBeDefined();
    expect(verifiedHistory?.changedBy?.toString()).toBe(admin._id.toString());
    expect(verifiedHistory?.note).toBe(verifyRemarks);

    // 5. Confirm Verification record was created in the database
    const verifications = await Verification.find({ request: reqDoc?._id });
    expect(verifications.length).toBe(1);
    const vRecord = verifications[0];
    expect(vRecord.verifiedBy.toString()).toBe(admin._id.toString());
    expect(vRecord.result).toBe('verified_legitimate');
    expect(vRecord.method).toBe('phone_call');
    expect(vRecord.remarks).toBe(verifyRemarks);
    expect(vRecord.timestamp).toBeDefined();

    // 6. Test GET /api/requests/:id/verification endpoint
    const getVerifRes = await request(app).get(`/api/requests/${requestId}/verification`);
    expect(getVerifRes.status).toBe(200);
    expect(getVerifRes.body.verification.remarks).toBe(verifyRemarks);
    expect(getVerifRes.body.verification.verifiedBy.name).toBe('Verification Admin');
  });

  it('should verify cleanly and not break anything when remarks are completely omitted', async () => {
    // 1. Create admin user
    const admin = await User.create({
      name: 'Silent Admin',
      email: 'admin.silent@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // 2. Submit emergency request
    const subRes = await request(app).post('/api/requests').send({
      category: 'supplies',
      description: 'Food packets needed for flood relief camp',
      preciseLat: 30.895,
      preciseLng: 75.845,
      contactPhone: '+91 97777 54321',
    });
    const requestId = subRes.body.requestId;

    // 3. Admin verifies with completely empty body (no remarks, no note)
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.request.status).toBe('verified');

    // 4. Confirm StatusHistory entry fallback
    const reqDoc = await RequestModel.findOne({ requestId });
    const verifiedHistory = reqDoc?.statusHistory.find((h) => h.status === 'verified');
    expect(verifiedHistory).toBeDefined();
    expect(verifiedHistory?.note).toBe('Request verified by administrator');

    // 5. Confirm Verification record exists with undefined remarks and valid defaults
    const vRecord = await Verification.findOne({ request: reqDoc?._id });
    expect(vRecord).toBeDefined();
    expect(vRecord?.remarks).toBeUndefined();
    expect(vRecord?.result).toBe('verified_legitimate');
    expect(vRecord?.verifiedBy.toString()).toBe(admin._id.toString());
  });

  it('should transition request to closed when marked duplicate or unfounded', async () => {
    const admin = await User.create({
      name: 'Auditor Admin',
      email: 'auditor@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // 1. Submit request
    const subRes = await request(app).post('/api/requests').send({
      category: 'supplies',
      description: 'Potential duplicate report from caller',
      preciseLat: 30.902,
      preciseLng: 75.852,
      contactPhone: '+91 99999 88888',
    });
    const requestId = subRes.body.requestId;

    // 2. Admin verifies as duplicate
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        result: 'duplicate',
        method: 'cross_reference',
        remarks: 'Matched with REQ-2026-000001 identical coordinates',
        priorityAssessment: 'low',
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.request.status).toBe('closed');
    expect(verifyRes.body.message).toContain('marked as duplicate and archived');

    // 3. Confirm status history in DB
    const reqDoc = await RequestModel.findOne({ requestId });
    expect(reqDoc?.status).toBe('closed');
    const closedHistory = reqDoc?.statusHistory.find((h) => h.status === 'closed');
    expect(closedHistory).toBeDefined();
    expect(closedHistory?.note).toContain('Matched with REQ-2026-000001');

    // 4. Confirm Verification record
    const verif = await Verification.findOne({ request: reqDoc?._id });
    expect(verif).toBeDefined();
    expect(verif?.result).toBe('duplicate');
    expect(verif?.method).toBe('cross_reference');
    expect(verif?.priorityAssessment).toBe('low');
  });

  it('should reject an admin attempting to verify their own submitted request, while allowing verification of other requests', async () => {
    // 1. Create two admins and a citizen
    const adminAlice = await User.create({
      name: 'Admin Alice',
      email: 'alice@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminBob = await User.create({
      name: 'Admin Bob',
      email: 'bob@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const citizen = await User.create({
      name: 'Citizen Deepak',
      email: 'deepak@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });

    const tokenAlice = createAuthToken(adminAlice._id.toString(), 'admin');
    const tokenBob = createAuthToken(adminBob._id.toString(), 'admin');

    // 2. Admin Alice submits an emergency request
    const aliceReq = await RequestModel.create({
      requestId: 'REQ-ALICE-OWN',
      category: 'medical',
      description: 'Medical supplies needed at shelter 3',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'unverified',
      createdBy: adminAlice._id,
    });

    // 3. Admin Alice tries to verify her own request -> 403 Forbidden
    const selfVerifyRes = await request(app)
      .patch(`/api/requests/${aliceReq.requestId}/verify`)
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        result: 'verified_legitimate',
        remarks: 'Self verified',
      });

    expect(selfVerifyRes.status).toBe(403);
    expect(selfVerifyRes.body.error).toContain('cannot verify emergency requests that they submitted themselves');

    // 4. Admin Bob verifies Alice's request -> 200 OK
    const peerVerifyRes = await request(app)
      .patch(`/api/requests/${aliceReq.requestId}/verify`)
      .set('Authorization', `Bearer ${tokenBob}`)
      .send({
        result: 'verified_legitimate',
        remarks: 'Peer verified after call',
      });

    expect(peerVerifyRes.status).toBe(200);
    expect(peerVerifyRes.body.request.status).toBe('verified');

    // 5. Citizen submits request -> Admin Alice can verify it normally -> 200 OK
    const citizenReq = await RequestModel.create({
      requestId: 'REQ-CITIZEN-01',
      category: 'rescue',
      description: 'Trapped on balcony',
      location: { preciseLat: 28.62, preciseLng: 77.24, publicLat: 28.62, publicLng: 77.24 },
      status: 'unverified',
      createdBy: citizen._id,
    });

    const aliceVerifyCitizenRes = await request(app)
      .patch(`/api/requests/${citizenReq.requestId}/verify`)
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({
        result: 'verified_legitimate',
        remarks: 'Confirmed with citizen via phone',
      });

    expect(aliceVerifyCitizenRes.status).toBe(200);
    expect(aliceVerifyCitizenRes.body.request.status).toBe('verified');
  });
});

