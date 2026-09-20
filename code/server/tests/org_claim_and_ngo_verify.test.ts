import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Organization,
  Request as RequestModel,
  RequestAssignment,
  Verification,
  Notification,
  Message,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-org-claims-and-ngo-verify';

function createAuthToken(userId: string, role: string, name?: string): string {
  return jwt.sign({ userId, role, name }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await Organization.syncIndexes();
  await RequestModel.syncIndexes();
  await RequestAssignment.syncIndexes();
  await Verification.syncIndexes();
  await Notification.syncIndexes();
  await Message.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Organization.deleteMany({});
  await RequestModel.deleteMany({});
  await RequestAssignment.deleteMany({});
  await Verification.deleteMany({});
  await Notification.deleteMany({});
  await Message.deleteMany({});
});

describe('Org-Level Claim Ownership & Verified NGO Verification Authority', () => {
  it('should allow a verified NGO member to verify an unverified request, while rejecting unverified NGOs and volunteers', async () => {
    // 1. Setup organizations: one verified, one unverified
    const verifiedOrg = await Organization.create({
      name: 'Red Cross Patiala Unit',
      type: 'ngo',
      isVerified: true,
    });

    const unverifiedOrg = await Organization.create({
      name: 'Grassroots Unverified Volunteer Guild',
      type: 'ngo',
      isVerified: false,
    });

    // 2. Setup users
    const verifiedNgoUser = await User.create({
      name: 'Priya Sharma (Red Cross)',
      email: 'priya@redcross.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: verifiedOrg._id,
    });

    const unverifiedNgoUser = await User.create({
      name: 'Karan Deep (Unverified)',
      email: 'karan@unverified.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: unverifiedOrg._id,
    });

    const unaffiliatedNgoUser = await User.create({
      name: 'No Org NGO User',
      email: 'noorg@ngo.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });

    const volunteer = await User.create({
      name: 'Independent Volunteer',
      email: 'volunteer@resq.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const citizen = await User.create({
      name: 'Amit Citizen',
      email: 'amit@citizen.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });

    const verifiedNgoToken = createAuthToken(verifiedNgoUser._id.toString(), 'ngo', verifiedNgoUser.name);
    const unverifiedNgoToken = createAuthToken(unverifiedNgoUser._id.toString(), 'ngo', unverifiedNgoUser.name);
    const unaffiliatedNgoToken = createAuthToken(unaffiliatedNgoUser._id.toString(), 'ngo', unaffiliatedNgoUser.name);
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer', volunteer.name);

    // 3. Create unverified citizen request
    const citizenReq = await RequestModel.create({
      requestId: 'REQ-TEST-VERIFY-001',
      category: 'medical',
      description: 'Need oxygen cylinder at Urban Estate',
      location: { preciseLat: 30.34, preciseLng: 76.38, publicLat: 30.34, publicLng: 76.38 },
      status: 'unverified',
      createdBy: citizen._id,
      contactPhone: '9876543210',
    });

    // Volunteer tries to verify -> 403
    const volVerify = await request(app)
      .patch(`/api/requests/${citizenReq.requestId}/verify`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ remarks: 'Looks legit' });
    expect(volVerify.status).toBe(403);
    expect(volVerify.body.error).toContain('Access forbidden');

    // Unaffiliated NGO tries to verify -> 403
    const unaffVerify = await request(app)
      .patch(`/api/requests/${citizenReq.requestId}/verify`)
      .set('Authorization', `Bearer ${unaffiliatedNgoToken}`)
      .send({ remarks: 'Trying without org' });
    expect(unaffVerify.status).toBe(403);
    expect(unaffVerify.body.error).toContain('Only members of verified organizations');

    // Unverified NGO tries to verify -> 403
    const unverVerify = await request(app)
      .patch(`/api/requests/${citizenReq.requestId}/verify`)
      .set('Authorization', `Bearer ${unverifiedNgoToken}`)
      .send({ remarks: 'Trying as unverified org' });
    expect(unverVerify.status).toBe(403);
    expect(unverVerify.body.error).toContain('Your organization is not verified');

    // Verified NGO verifies ticket -> 200
    const verifiedVerify = await request(app)
      .patch(`/api/requests/${citizenReq.requestId}/verify`)
      .set('Authorization', `Bearer ${verifiedNgoToken}`)
      .send({ remarks: 'Patient verified via telephone contact with doctor', result: 'verified_legitimate' });
    expect(verifiedVerify.status).toBe(200);
    expect(verifiedVerify.body.request.status).toBe('verified');

    // Confirm verification audit record and status note
    const updatedReq = await RequestModel.findOne({ requestId: citizenReq.requestId });
    expect(updatedReq?.status).toBe('verified');
    expect(updatedReq?.statusHistory[updatedReq.statusHistory.length - 1].note).toContain('telephone contact with doctor');

    const auditRecord = await Verification.findOne({ request: citizenReq._id });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.verifiedBy.toString()).toBe(verifiedNgoUser._id.toString());
  });

  it('should reject verified NGO from verifying their own ticket or tickets created by their teammates (Conflict of Interest)', async () => {
    const verifiedOrg = await Organization.create({
      name: 'Khalsa Aid Patiala',
      type: 'ngo',
      isVerified: true,
    });

    const ngoMemberA = await User.create({
      name: 'Harman Singh',
      email: 'harman@khalsaaid.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: verifiedOrg._id,
    });

    const ngoMemberB = await User.create({
      name: 'Gurpreet Kaur',
      email: 'gurpreet@khalsaaid.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: verifiedOrg._id,
    });

    const tokenA = createAuthToken(ngoMemberA._id.toString(), 'ngo', ngoMemberA.name);
    const tokenB = createAuthToken(ngoMemberB._id.toString(), 'ngo', ngoMemberB.name);

    // Request submitted by Member A
    const reqByA = await RequestModel.create({
      requestId: 'REQ-TEST-CONFLICT-001',
      category: 'supplies',
      description: 'Water rationing needed for flooded block C',
      location: { preciseLat: 30.33, preciseLng: 76.39, publicLat: 30.33, publicLng: 76.39 },
      status: 'unverified',
      createdBy: ngoMemberA._id,
    });

    // Member A attempts self-verification -> 403
    const selfVerify = await request(app)
      .patch(`/api/requests/${reqByA.requestId}/verify`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ remarks: 'Self verifying' });
    expect(selfVerify.status).toBe(403);
    expect(selfVerify.body.error).toContain('cannot verify emergency requests that they submitted themselves');

    // Teammate Member B attempts to verify submission by Member A (same org) -> 403
    const teammateVerify = await request(app)
      .patch(`/api/requests/${reqByA.requestId}/verify`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ remarks: 'Teammate verifying' });
    expect(teammateVerify.status).toBe(403);
    expect(teammateVerify.body.error).toContain('cannot verify emergency requests submitted by members of their own organization');

    // Central Admin CAN verify Member A's ticket -> 200
    const admin = await User.create({
      name: 'Admin Officer',
      email: 'admin@resq.gov',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), 'admin', admin.name);

    const adminVerify = await request(app)
      .patch(`/api/requests/${reqByA.requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ remarks: 'Independent dispatch review confirmed requirement' });
    expect(adminVerify.status).toBe(200);
    expect(adminVerify.body.request.status).toBe('verified');
  });

  it('should support org-level claim ownership: allow teammate B to resolve request claimed by teammate A and participate in messages', async () => {
    const org = await Organization.create({
      name: 'Doctors Without Borders Field Unit',
      type: 'ngo',
      isVerified: true,
    });

    const otherOrg = await Organization.create({
      name: 'Unrelated Relief Society',
      type: 'ngo',
      isVerified: true,
    });

    const responderA = await User.create({
      name: 'Dr. Aarav (Shift 1 Lead)',
      email: 'aarav@msf.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: org._id,
    });

    const responderB = await User.create({
      name: 'Nurse Simran (Shift 2 Handover)',
      email: 'simran@msf.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: org._id,
    });

    const outsiderNgo = await User.create({
      name: 'Rajesh (Unrelated Org)',
      email: 'rajesh@unrelated.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
      organizationId: otherOrg._id,
    });

    const citizen = await User.create({
      name: 'Balwinder Citizen',
      email: 'balwinder@gmail.com',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });

    const tokenA = createAuthToken(responderA._id.toString(), 'ngo', responderA.name);
    const tokenB = createAuthToken(responderB._id.toString(), 'ngo', responderB.name);
    const outsiderToken = createAuthToken(outsiderNgo._id.toString(), 'ngo', outsiderNgo.name);

    // 1. Create a verified request
    const verifiedReq = await RequestModel.create({
      requestId: 'REQ-TEST-ORG-CLAIM-001',
      category: 'medical',
      description: 'Diabetic patient requiring cold storage insulin delivery',
      location: { preciseLat: 30.35, preciseLng: 76.4, publicLat: 30.35, publicLng: 76.4 },
      status: 'verified',
      createdBy: citizen._id,
      contactPhone: '9876543210',
    });

    // 2. Responder A claims the request
    const claimRes = await request(app)
      .patch(`/api/requests/${verifiedReq.requestId}/claim`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ note: 'MSF Unit taking charge of cold storage transport' });

    expect(claimRes.status).toBe(200);
    expect(claimRes.body.request.status).toBe('in_progress');

    // Confirm that claimedOrg was persisted on the Request and RequestAssignment
    const claimedDbReq = await RequestModel.findOne({ requestId: verifiedReq.requestId });
    expect(claimedDbReq?.claimedBy?.toString()).toBe(responderA._id.toString());
    expect(claimedDbReq?.claimedOrg?.toString()).toBe(org._id.toString());

    const assignment = await RequestAssignment.findOne({ request: verifiedReq._id });
    expect(assignment?.assignedOrg?.toString()).toBe(org._id.toString());

    // 3. Outsider NGO tries to resolve -> 403 Access Denied
    const outsiderResolve = await request(app)
      .patch(`/api/requests/${verifiedReq.requestId}/resolve`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ note: 'Attempting illegitimate resolve' });
    expect(outsiderResolve.status).toBe(403);
    expect(outsiderResolve.body.error).toContain('Only the assigned claimant or an administrator');

    // 4. Teammate B (same organization) communicates on the thread -> 201
    const teammateMsg = await request(app)
      .post(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ body: 'Shift handover complete. Insulin unit arriving at your door now.' });
    expect(teammateMsg.status).toBe(201);
    expect(teammateMsg.body.message.senderRole).toBe('claimant');
    expect(teammateMsg.body.message.senderName).toContain('Teammate');

    // Teammate B reads messages -> 200
    const teammateGetMsgs = await request(app)
      .get(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(teammateGetMsgs.status).toBe(200);
    expect(teammateGetMsgs.body.count).toBe(1);

    // Outsider cannot access thread -> 403
    const outsiderGetMsgs = await request(app)
      .get(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(outsiderGetMsgs.status).toBe(403);

    // Teammate B gets unredacted coordinates & contact details on single fetch -> 200 with precise lat
    const teammateFetchReq = await request(app)
      .get(`/api/requests/${verifiedReq.requestId}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(teammateFetchReq.status).toBe(200);
    expect(teammateFetchReq.body.isPreciseLocationRevealed).toBe(true);
    expect(teammateFetchReq.body.request.location.preciseLat).toBe(30.35);

    // 5. Teammate B marks the request as resolved -> 200 Success
    const teammateResolve = await request(app)
      .patch(`/api/requests/${verifiedReq.requestId}/resolve`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ note: 'Insulin successfully delivered and verified with patient' });
    expect(teammateResolve.status).toBe(200);
    expect(teammateResolve.body.request.status).toBe('resolved');

    // Check DB state
    const resolvedDbReq = await RequestModel.findOne({ requestId: verifiedReq.requestId });
    expect(resolvedDbReq?.status).toBe('resolved');
    expect(resolvedDbReq?.statusHistory[resolvedDbReq.statusHistory.length - 1].note).toContain(
      'Insulin successfully delivered'
    );
  });
});
