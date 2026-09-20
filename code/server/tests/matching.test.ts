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
  RequestResource,
  Notification,
} from '../src/models';
import {
  calculateHaversineDistanceKm,
  calculateMatchesForRequest,
} from '../src/services/matching';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-matching-tests';

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
  await RequestResource.syncIndexes();
  await Notification.syncIndexes();
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
  await RequestResource.deleteMany({});
  await Notification.deleteMany({});
});

describe('Phase 4: Rule-Based Matching Engine Unit & Scoring Tests', () => {
  it('should calculate accurate Haversine distance in kilometers', () => {
    // Connaught Place, New Delhi: 28.6315, 77.2167
    // India Gate, New Delhi: 28.6129, 77.2295 (~2.4 km)
    const dist = calculateHaversineDistanceKm(28.6315, 77.2167, 28.6129, 77.2295);
    expect(dist).toBeGreaterThan(2.0);
    expect(dist).toBeLessThan(3.0);
  });

  it('should score proximity higher for closer candidates and treat undeclared location as neutral (0.5)', async () => {
    // Request location in South Delhi (28.5355, 77.2410)
    const requester = await User.create({
      name: 'Requester',
      email: 'req@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    await RequestModel.create({
      requestId: 'REQ-PROX-01',
      createdBy: requester._id,
      category: 'medical',
      description: 'Emergency medicine delivery needed',
      status: 'verified',
      location: {
        address: 'Saket, New Delhi',
        publicLat: 28.5355,
        publicLng: 77.2410,
        preciseLat: 28.5355,
        preciseLng: 77.2410,
      },
      peopleCount: 2,
    });

    // Candidate 1: Close (1.5 km away)
    const candidateClose = await User.create({
      name: 'Close Volunteer',
      email: 'close@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
      location: {
        address: 'Malviya Nagar',
        lat: 28.5273,
        lng: 77.2090,
      },
    });

    // Candidate 2: Distant (25 km away in Noida)
    const candidateFar = await User.create({
      name: 'Far Volunteer',
      email: 'far@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
      location: {
        address: 'Noida Sector 62',
        lat: 28.6270,
        lng: 77.3725,
      },
    });

    // Candidate 3: Undeclared location
    const candidateNoLoc = await User.create({
      name: 'Neutral Volunteer',
      email: 'neutral@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const result = await calculateMatchesForRequest('REQ-PROX-01');
    expect(result).toBeDefined();
    expect(result!.matches.length).toBe(3);

    const closeMatch = result!.matches.find((m) => m.candidateId === candidateClose._id.toString());
    const farMatch = result!.matches.find((m) => m.candidateId === candidateFar._id.toString());
    const noLocMatch = result!.matches.find((m) => m.candidateId === candidateNoLoc._id.toString());

    expect(closeMatch).toBeDefined();
    expect(farMatch).toBeDefined();
    expect(noLocMatch).toBeDefined();

    expect(closeMatch!.factors.proximity.score).toBeGreaterThan(farMatch!.factors.proximity.score);
    expect(noLocMatch!.factors.proximity.score).toBe(0.5); // strictly neutral per requirements
    expect(noLocMatch!.factors.proximity.explanation).toContain('neutral baseline');
  });

  it('should score candidates with matching inventory resources higher on suitability and capacity', async () => {
    const requester = await User.create({
      name: 'Requester',
      email: 'req2@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    const testReq = await RequestModel.create({
      requestId: 'REQ-SUIT-01',
      createdBy: requester._id,
      category: 'medical',
      description: 'First aid kits and bandages needed',
      status: 'verified',
      location: {
        address: 'Connaught Place',
        publicLat: 28.6315,
        publicLng: 77.2167,
        preciseLat: 28.6315,
        preciseLng: 77.2167,
      },
      peopleCount: 5,
    });

    // Provider A: Has 20 kits in stock
    const providerA = await User.create({
      name: 'Delhi Medical Depot',
      email: 'depot@resq.org',
      passwordHash: 'hash',
      role: 'resource_provider',
    });

    // Create a Resource
    const medKitResource = await Resource.create({
      name: 'Trauma First Aid Kit',
      category: 'medical',
      unit: 'kit',
      ownerId: providerA._id,
    });

    // Link Request to this Resource requirement
    await RequestResource.create({
      request: testReq._id,
      resource: medKitResource._id,
      quantityRequested: 5,
    });

    await ResourceInventory.create({
      resource: medKitResource._id,
      ownerType: 'User',
      ownerId: providerA._id,
      quantityAvailable: 20,
      quantityReserved: 5,
    });

    // Provider B: No matching inventory
    const providerB = await User.create({
      name: 'Blank Depot',
      email: 'blank@resq.org',
      passwordHash: 'hash',
      role: 'resource_provider',
    });

    const result = await calculateMatchesForRequest('REQ-SUIT-01');
    expect(result).toBeDefined();
    const matchA = result!.matches.find((m) => m.candidateId === providerA._id.toString());
    const matchB = result!.matches.find((m) => m.candidateId === providerB._id.toString());

    expect(matchA).toBeDefined();
    expect(matchB).toBeDefined();
    expect(matchA!.factors.suitability.score).toBeGreaterThan(matchB!.factors.suitability.score);
    expect(matchA!.factors.capacity.score).toBe(1.0); // full capacity satisfied
    expect(matchA!.overallScore).toBeGreaterThan(matchB!.overallScore);
  });

  it('should score undeclared availability neutrally (0.5) without penalizing candidate', async () => {
    const requester = await User.create({
      name: 'Requester',
      email: 'req3@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    await RequestModel.create({
      requestId: 'REQ-AVAIL-01',
      createdBy: requester._id,
      category: 'supplies',
      description: 'Ration delivery',
      status: 'verified',
      location: {
        address: 'Karol Bagh',
        publicLat: 28.6515,
        publicLng: 77.1906,
        preciseLat: 28.6515,
        preciseLng: 77.1906,
      },
      peopleCount: 4,
    });

    const unspecVolunteer = await User.create({
      name: 'Flex Volunteer',
      email: 'flex@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
      // availability completely omitted
    });

    const result = await calculateMatchesForRequest('REQ-AVAIL-01');
    expect(result).toBeDefined();
    const match = result!.matches.find((m) => m.candidateId === unspecVolunteer._id.toString());
    expect(match).toBeDefined();
    expect(match!.factors.availability.score).toBe(0.5);
    expect(match!.factors.availability.explanation).toContain('neutral baseline');
  });
});

describe('Phase 4: Matching API Endpoints & Zero Auto-Assignment', () => {
  it('GET /api/requests/:id/matches: blocks unauthorized roles and returns ranked matches for admins/dispatchers', async () => {
    const requester = await User.create({
      name: 'Citizen Jane',
      email: 'jane@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    const volunteer = await User.create({
      name: 'Responder Ravi',
      email: 'ravi@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const admin = await User.create({
      name: 'Admin Chief',
      email: 'chief@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const reqDoc = await RequestModel.create({
      requestId: 'REQ-API-01',
      createdBy: requester._id,
      category: 'rescue',
      description: 'Flood evacuation',
      status: 'verified',
      location: {
        address: 'Yamuna Bank',
        publicLat: 28.6250,
        publicLng: 77.2600,
        preciseLat: 28.6250,
        preciseLng: 77.2600,
      },
      peopleCount: 3,
    });

    const requesterToken = createAuthToken(requester._id.toString(), 'affected_person');
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // 1. Citizen is blocked (403)
    const resCitizen = await request(app)
      .get(`/api/requests/${reqDoc.requestId}/matches`)
      .set('Authorization', `Bearer ${requesterToken}`);
    expect(resCitizen.status).toBe(403);

    // 2. Volunteer is blocked (403)
    const resVolunteer = await request(app)
      .get(`/api/requests/${reqDoc.requestId}/matches`)
      .set('Authorization', `Bearer ${volunteerToken}`);
    expect(resVolunteer.status).toBe(403);

    // 3. Admin succeeds (200) and receives ranked matches with breakdown
    const resAdmin = await request(app)
      .get(`/api/requests/${reqDoc.requestId}/matches`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.success).toBe(true);
    expect(Array.isArray(resAdmin.body.data.matches)).toBe(true);
    expect(resAdmin.body.data.matches.length).toBeGreaterThan(0);

    const firstMatch = resAdmin.body.data.matches[0];
    expect(firstMatch).toHaveProperty('overallScore');
    expect(firstMatch).toHaveProperty('name');
    expect(firstMatch).toHaveProperty('factors');
    expect(firstMatch.factors).toHaveProperty('proximity');
    expect(firstMatch.factors).toHaveProperty('suitability');
    expect(firstMatch.factors).toHaveProperty('capacity');
    expect(firstMatch.factors).toHaveProperty('availability');
    expect(firstMatch.factors.proximity).toHaveProperty('explanation');
  });

  it('POST /api/requests/:id/invite: dispatches an invitation notification without auto-claiming or changing ticket status', async () => {
    const requester = await User.create({
      name: 'Requester Anita',
      email: 'anita@resq.org',
      passwordHash: 'hash',
      role: 'affected_person',
    });

    const candidate = await User.create({
      name: 'Volunteer Vijay',
      email: 'vijay@resq.org',
      passwordHash: 'hash',
      role: 'volunteer',
    });

    const admin = await User.create({
      name: 'Dispatch Admin',
      email: 'dispadmin@resq.org',
      passwordHash: 'hash',
      role: 'admin',
    });

    const reqDoc = await RequestModel.create({
      requestId: 'REQ-INV-01',
      createdBy: requester._id,
      category: 'medical',
      description: 'Needs oxygen cylinder delivery',
      status: 'verified',
      location: {
        address: 'Lajpat Nagar',
        publicLat: 28.5677,
        publicLng: 77.2433,
        preciseLat: 28.5677,
        preciseLng: 77.2433,
      },
      peopleCount: 1,
    });

    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    // Send dispatch invitation
    const inviteRes = await request(app)
      .post(`/api/requests/${reqDoc.requestId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        candidateId: candidate._id.toString(),
        message: 'Matches oxygen equipment skills nearby',
      });

    expect(inviteRes.status).toBe(200);
    expect(inviteRes.body.success).toBe(true);
    expect(inviteRes.body.data.notification).toBeDefined();
    expect(inviteRes.body.data.notification.type).toBe('dispatch_invite');
    expect(inviteRes.body.data.notification.recipient).toBe(candidate._id.toString());

    // CRITICAL: Verify ticket status and claimedBy were NOT changed (SUGGESTIONS ONLY safeguard)
    const freshReq = await RequestModel.findOne({ requestId: 'REQ-INV-01' });
    expect(freshReq!.status).toBe('verified'); // Still verified, NOT claimed
    expect(freshReq!.claimedBy).toBeUndefined(); // Still unassigned

    // Verify notification was written to DB for the candidate
    const candidateNotifications = await Notification.find({ recipient: candidate._id });
    expect(candidateNotifications.length).toBe(1);
    expect(candidateNotifications[0].type).toBe('dispatch_invite');
    expect(candidateNotifications[0].request?.toString()).toBe(reqDoc._id.toString());

    // Attempting duplicate invite returns 400
    const duplicateRes = await request(app)
      .post(`/api/requests/${reqDoc.requestId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ candidateId: candidate._id.toString() });
    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error).toContain('already has an active invitation');
  });
});
