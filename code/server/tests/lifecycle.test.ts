import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { User, Request as RequestModel } from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-lifecycle-tests';

let adminToken: string;
let adminId: string;
let volunteerToken: string;
let volunteerId: string;
let otherVolunteerToken: string;
let affectedPersonToken: string;
let affectedPersonId: string;

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

  const admin = await User.create({
    name: 'Admin Dispatcher',
    email: 'admin@resq.org',
    passwordHash: 'hash',
    role: 'admin',
  });
  adminId = admin._id.toString();
  adminToken = jwt.sign({ userId: adminId, role: 'admin' }, TEST_JWT_SECRET);

  const volunteer = await User.create({
    name: 'Volunteer Responder',
    email: 'volunteer@resq.org',
    passwordHash: 'hash',
    role: 'volunteer',
  });
  volunteerId = volunteer._id.toString();
  volunteerToken = jwt.sign({ userId: volunteerId, role: 'volunteer' }, TEST_JWT_SECRET);

  const otherVolunteer = await User.create({
    name: 'Other Volunteer',
    email: 'other.volunteer@resq.org',
    passwordHash: 'hash',
    role: 'volunteer',
  });
  otherVolunteerToken = jwt.sign(
    { userId: otherVolunteer._id.toString(), role: 'volunteer' },
    TEST_JWT_SECRET
  );

  const affectedPerson = await User.create({
    name: 'Affected Person',
    email: 'affected@resq.org',
    passwordHash: 'hash',
    role: 'affected_person',
  });
  affectedPersonId = affectedPerson._id.toString();
  affectedPersonToken = jwt.sign(
    { userId: affectedPersonId, role: 'affected_person' },
    TEST_JWT_SECRET
  );
});

describe('Emergency Request Lifecycle Endpoints', () => {
  it('should complete the full happy path: unverified -> verified -> in_progress -> resolved -> closed', async () => {
    // 1. Create a request as logged in affected person
    const createRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${affectedPersonToken}`)
      .send({
        category: 'rescue',
        description: 'Stranded on first floor balcony',
        preciseLat: 30.901,
        preciseLng: 75.8573,
        contactPhone: '+91 98765 11111',
      });
    expect(createRes.status).toBe(201);
    const requestId = createRes.body.requestId;
    expect(createRes.body.request.status).toBe('unverified');

    // 2. Admin verifies request
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Verified by dispatcher via local ward contact' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.request.status).toBe('verified');

    // 3. Volunteer claims request
    const claimRes = await request(app)
      .patch(`/api/requests/${requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Team dispatched with rescue boat' });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.request.status).toBe('in_progress');
    expect(claimRes.body.request.claimedBy._id).toBe(volunteerId);
    // Precise location & contact phone revealed to claimant
    expect(claimRes.body.request.location.preciseLat).toBe(30.901);
    expect(claimRes.body.request.contactPhone).toBe('+91 98765 11111');

    // 4. Volunteer marks resolved
    const resolveRes = await request(app)
      .patch(`/api/requests/${requestId}/resolve`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Evacuated family to shelter' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.request.status).toBe('resolved');

    // 5. Requester confirms resolution
    const confirmRes = await request(app)
      .patch(`/api/requests/${requestId}/confirm`)
      .set('Authorization', `Bearer ${affectedPersonToken}`)
      .send({ note: 'Safely reached shelter' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.request.status).toBe('closed');

    // Verify statusHistory audit trail
    const finalDoc = await RequestModel.findOne({ requestId });
    expect(finalDoc).not.toBeNull();
    const historyStatuses = finalDoc!.statusHistory.map((h) => h.status);
    expect(historyStatuses).toEqual([
      'unverified',
      'verified',
      'in_progress',
      'resolved',
      'closed',
    ]);
  });

  it('should reject skipping stages in lifecycle order', async () => {
    // Create an unverified request
    const reqDoc = await RequestModel.create({
      category: 'supplies',
      description: 'Drinking water required',
      location: { preciseLat: 30.91, preciseLng: 75.86 },
      status: 'unverified',
    });

    // Attempt to claim unverified request (skipping verified)
    const claimRes = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(claimRes.status).toBe(400);
    expect(claimRes.body.error).toMatch(/current status is 'unverified', expected 'verified'/i);

    // Attempt to resolve unverified request (skipping verified & in_progress)
    const resolveRes = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resolveRes.status).toBe(400);
    expect(resolveRes.body.error).toMatch(/current status is 'unverified', expected 'in_progress'/i);

    // Attempt to confirm unverified request
    const confirmRes = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/confirm`)
      .send({});
    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.error).toMatch(/current status is 'unverified', expected 'resolved'/i);
  });

  it('should reject reversing or modifying completed lifecycle steps', async () => {
    // Create a verified request
    const reqDoc = await RequestModel.create({
      category: 'medical',
      description: 'First aid needed',
      location: { preciseLat: 30.91, preciseLng: 75.86 },
      status: 'verified',
    });

    // Attempt to verify already verified request
    const verifyAgain = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyAgain.status).toBe(400);
    expect(verifyAgain.body.error).toMatch(/current status is 'verified', expected 'unverified'/i);
  });

  it('should enforce role-based access on transitions', async () => {
    const reqDoc = await RequestModel.create({
      category: 'medical',
      description: 'Oxygen cylinder needed',
      location: { preciseLat: 30.91, preciseLng: 75.86 },
      status: 'unverified',
    });

    // 1. Volunteer cannot verify (admin only)
    const volVerify = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/verify`)
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(volVerify.status).toBe(403);

    // Admin verifies it to move to verified
    await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);

    // 2. Affected person cannot claim (volunteer/ngo only)
    const affClaim = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/claim`)
      .set('Authorization', `Bearer ${affectedPersonToken}`);
    expect(affClaim.status).toBe(403);

    // Resource provider cannot claim (restricted to volunteer and ngo)
    const providerUser = await User.create({
      name: 'Warehouse Provider',
      email: 'provider.claim@resq.org',
      passwordHash: 'hash',
      role: 'resource_provider',
    });
    const providerToken = jwt.sign(
      { userId: providerUser._id.toString(), role: 'resource_provider' },
      TEST_JWT_SECRET
    );
    const provClaim = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/claim`)
      .set('Authorization', `Bearer ${providerToken}`);
    expect(provClaim.status).toBe(403);
    expect(provClaim.body.error).toMatch(/Access forbidden/i);

    // NGO CAN claim verified requests
    const ngoUser = await User.create({
      name: 'Relief NGO Team',
      email: 'ngo.claim@resq.org',
      passwordHash: 'hash',
      role: 'ngo',
    });
    const ngoToken = jwt.sign(
      { userId: ngoUser._id.toString(), role: 'ngo' },
      TEST_JWT_SECRET
    );
    const ngoClaim = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/claim`)
      .set('Authorization', `Bearer ${ngoToken}`);
    expect(ngoClaim.status).toBe(200);
    expect(ngoClaim.body.request.status).toBe('in_progress');
    expect(ngoClaim.body.request.claimedBy._id).toBe(ngoUser._id.toString());

    // 3. Unrelated volunteer cannot resolve a request claimed by another volunteer
    const otherVolResolve = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/resolve`)
      .set('Authorization', `Bearer ${otherVolunteerToken}`);
    expect(otherVolResolve.status).toBe(403);
    expect(otherVolResolve.body.error).toMatch(/Only the assigned claimant or an administrator/i);

    // Admin CAN resolve the request
    const adminResolve = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminResolve.status).toBe(200);
    expect(adminResolve.body.request.status).toBe('resolved');
  });

  it('should verify anonymous requester via contact phone and forbid responder force-closing', async () => {
    // Create anonymous request with phone number
    const anonReq = await RequestModel.create({
      category: 'shelter',
      description: 'Temporary tarp required',
      location: { preciseLat: 30.91, preciseLng: 75.86 },
      status: 'resolved',
      contactPhone: '+91 99887 76655',
    });

    // 1. Responders and admins cannot force-close
    const responderForceClose = await request(app)
      .patch(`/api/requests/${anonReq.requestId}/confirm`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ contactPhone: '+91 00000 00000' });
    expect(responderForceClose.status).toBe(403);
    expect(responderForceClose.body.error).toMatch(/Only the original requester/i);

    // 2. Anonymous requester with incorrect phone number cannot close
    const wrongPhoneClose = await request(app)
      .patch(`/api/requests/${anonReq.requestId}/confirm`)
      .send({ contactPhone: '+91 12345 67890' });
    expect(wrongPhoneClose.status).toBe(403);

    // 3. Anonymous requester with matching phone number confirms and closes
    const validClose = await request(app)
      .patch(`/api/requests/${anonReq.requestId}/confirm`)
      .send({ contactPhone: '+91 99887 76655' });
    expect(validClose.status).toBe(200);
    expect(validClose.body.request.status).toBe('closed');
  });
});
