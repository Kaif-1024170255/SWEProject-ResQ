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
  Message,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-messages-tests';

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
  await Message.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Notification.deleteMany({});
  await Message.deleteMany({});
});

describe('Request-Scoped Messaging & Thread Authorization', () => {
  it('should allow admin and requester to exchange messages on unverified and verified requests, while rejecting unrelated volunteers', async () => {
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const requester = await User.create({
      name: 'Sunita Requester',
      email: 'sunita@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const volunteer = await User.create({
      name: 'Field Volunteer',
      email: 'volunteer@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);
    const requesterToken = createAuthToken(requester._id.toString(), requester.role, requester.name);
    const volunteerToken = createAuthToken(volunteer._id.toString(), volunteer.role, volunteer.name);

    // 1. Unverified request
    const unverifiedReq = await RequestModel.create({
      requestId: 'REQ-TEST-UNVERIFIED',
      category: 'medical',
      description: 'Need urgent insulin at sector 14',
      location: { preciseLat: 28.61, preciseLng: 77.23, publicLat: 28.61, publicLng: 77.23 },
      status: 'unverified',
      createdBy: requester._id,
      contactPhone: '9876543210',
    });

    // Unrelated volunteer tries to post on unverified -> 403
    const volPostUnverified = await request(app)
      .post(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ body: 'Can I help?' });
    expect(volPostUnverified.status).toBe(403);
    expect(volPostUnverified.body.error).toContain('Access denied');

    // Unrelated volunteer tries to read unverified -> 403
    const volGetUnverified = await request(app)
      .get(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(volGetUnverified.status).toBe(403);

    // Admin asks clarifying question on unverified request -> 201
    const adminPostUnverified = await request(app)
      .post(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'What is the landmark near your house in sector 14?' });
    expect(adminPostUnverified.status).toBe(201);
    expect(adminPostUnverified.body.message.senderRole).toBe('admin');

    // Requester reads triage message -> 200
    const requesterGetUnverified = await request(app)
      .get(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${requesterToken}`);
    expect(requesterGetUnverified.status).toBe(200);
    expect(requesterGetUnverified.body.count).toBe(1);
    expect(requesterGetUnverified.body.messages[0].body).toContain('landmark');

    // Requester replies with clarifying details -> 201
    const requesterPostUnverified = await request(app)
      .post(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ body: 'Opposite Community Hall, yellow gate.' });
    expect(requesterPostUnverified.status).toBe(201);
    expect(requesterPostUnverified.body.message.senderRole).toBe('requester');

    // Admin checks thread -> 200 with 2 messages
    const adminGetUnverified = await request(app)
      .get(`/api/requests/${unverifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminGetUnverified.status).toBe(200);
    expect(adminGetUnverified.body.count).toBe(2);

    // 2. Verified request (awaiting claim)
    const verifiedReq = await RequestModel.create({
      requestId: 'REQ-TEST-VERIFIED',
      category: 'supplies',
      description: 'Water bottles required',
      location: { preciseLat: 28.62, preciseLng: 77.24, publicLat: 28.62, publicLng: 77.24 },
      status: 'verified',
      createdBy: requester._id,
      contactPhone: '9876543210',
    });

    // Unrelated volunteer tries to read or post on verified request -> 403
    const volGetVerified = await request(app)
      .get(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(volGetVerified.status).toBe(403);

    const volPostVerified = await request(app)
      .post(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ body: 'Taking this soon.' });
    expect(volPostVerified.status).toBe(403);

    // Admin posts on verified request -> 201
    const adminPostVerified = await request(app)
      .post(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'Verified report: dispatching supply unit shortly.' });
    expect(adminPostVerified.status).toBe(201);

    // Requester reads on verified request -> 200
    const requesterGetVerified = await request(app)
      .get(`/api/requests/${verifiedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${requesterToken}`);
    expect(requesterGetVerified.status).toBe(200);
    expect(requesterGetVerified.body.count).toBe(1);
  });

  it('should allow only authorized participants (claimant, requester, admin) to post and read', async () => {
    // 1. Create Requester, Claimant, Admin, and an Unauthorized Bystander
    const requester = await User.create({
      name: 'Sunita Requester',
      email: 'sunita@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const claimant = await User.create({
      name: 'Vikram Responder',
      email: 'vikram@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const bystander = await User.create({
      name: 'Other Volunteer',
      email: 'other@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const requesterToken = createAuthToken(requester._id.toString(), requester.role, requester.name);
    const claimantToken = createAuthToken(claimant._id.toString(), claimant.role, claimant.name);
    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);
    const bystanderToken = createAuthToken(bystander._id.toString(), bystander.role, bystander.name);

    // 2. Create a claimed request (in_progress)
    const activeReq = await RequestModel.create({
      requestId: 'REQ-ACTIVE-001',
      category: 'rescue',
      description: 'Boat needed for 4 people',
      location: { preciseLat: 28.6139, preciseLng: 77.209, publicLat: 28.6139, publicLng: 77.209 },
      status: 'in_progress',
      createdBy: requester._id,
      claimedBy: claimant._id,
    });

    // 3. Unauthorized bystander tries to post -> 403
    const bystanderPost = await request(app)
      .post(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${bystanderToken}`)
      .send({ body: 'Can I join in?' });

    expect(bystanderPost.status).toBe(403);
    expect(bystanderPost.body.error).toContain('Access denied');

    // 4. Unauthorized bystander tries to read -> 403
    const bystanderGet = await request(app)
      .get(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${bystanderToken}`);

    expect(bystanderGet.status).toBe(403);

    // 5. Claimant posts a message -> 201
    const claimantPost = await request(app)
      .post(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${claimantToken}`)
      .send({ body: 'En route with rescue raft. ETA 15 minutes.' });

    expect(claimantPost.status).toBe(201);
    expect(claimantPost.body.message.senderRole).toBe('claimant');
    expect(claimantPost.body.message.body).toBe('En route with rescue raft. ETA 15 minutes.');

    // 6. Check that notification was triggered for the requester
    const requesterNotifs = await Notification.find({ recipient: requester._id });
    expect(requesterNotifs.length).toBe(1);
    expect(requesterNotifs[0].type).toBe('new_message');
    expect(requesterNotifs[0].title).toContain('REQ-ACTIVE-001');

    // 7. Requester reads thread -> 200
    const requesterGet = await request(app)
      .get(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${requesterToken}`);

    expect(requesterGet.status).toBe(200);
    expect(requesterGet.body.count).toBe(1);
    expect(requesterGet.body.messages[0].body).toBe('En route with rescue raft. ETA 15 minutes.');

    // 8. Requester replies to the thread -> 201
    const requesterReply = await request(app)
      .post(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({ body: 'Understood. We are on the 2nd floor roof.' });

    expect(requesterReply.status).toBe(201);
    expect(requesterReply.body.message.senderRole).toBe('requester');

    // 9. Check that claimant received notification
    const claimantNotifs = await Notification.find({ recipient: claimant._id });
    expect(claimantNotifs.length).toBe(1);
    expect(claimantNotifs[0].type).toBe('new_message');

    // 10. Admin can read and post
    const adminGet = await request(app)
      .get(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminGet.status).toBe(200);
    expect(adminGet.body.count).toBe(2);

    const adminPost = await request(app)
      .post(`/api/requests/${activeReq.requestId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'NDRF team has been alerted as backup.' });

    expect(adminPost.status).toBe(201);
    expect(adminPost.body.message.senderRole).toBe('admin');
  });

  it('should allow anonymous requesters to read and post via phone verification', async () => {
    const responder = await User.create({
      name: 'Medic Anil',
      email: 'anil@example.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const responderToken = createAuthToken(responder._id.toString(), responder.role, responder.name);

    // Create an anonymous request with phone number
    const anonReq = await RequestModel.create({
      requestId: 'REQ-ANON-PHONE-01',
      category: 'medical',
      description: 'First aid kit needed',
      contactPhone: '+91 98765 43210',
      location: { preciseLat: 19.076, preciseLng: 72.877, publicLat: 19.076, publicLng: 72.877 },
      status: 'in_progress',
      claimedBy: responder._id,
    });

    // Unauthenticated attempt without phone -> 403
    const noPhoneGet = await request(app)
      .get(`/api/requests/${anonReq.requestId}/messages`);

    expect(noPhoneGet.status).toBe(403);

    // Unauthenticated attempt with wrong phone -> 403
    const wrongPhonePost = await request(app)
      .post(`/api/requests/${anonReq.requestId}/messages`)
      .send({
        contactPhone: '99999 00000',
        body: 'Where are you?',
      });

    expect(wrongPhonePost.status).toBe(403);

    // Unauthenticated attempt with matching phone -> 201
    const matchingPhonePost = await request(app)
      .post(`/api/requests/${anonReq.requestId}/messages`)
      .send({
        contactPhone: '98765 43210',
        body: 'We are near the red water tank.',
      });

    expect(matchingPhonePost.status).toBe(201);
    expect(matchingPhonePost.body.message.senderRole).toBe('requester');
    expect(matchingPhonePost.body.message.senderName).toBe('Requester (Phone Verified)');

    // Reading with matching phone query -> 200
    const matchingPhoneGet = await request(app)
      .get(`/api/requests/${anonReq.requestId}/messages?phone=9876543210`);

    expect(matchingPhoneGet.status).toBe(200);
    expect(matchingPhoneGet.body.count).toBe(1);
    expect(matchingPhoneGet.body.messages[0].body).toBe('We are near the red water tank.');
  });
});
