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
  RequestResource,
  RequestAssignment,
  Organization,
  ResourceInventory,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-allocation-tests';

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
  await RequestResource.syncIndexes();
  await RequestAssignment.syncIndexes();
  await Organization.syncIndexes();
  await ResourceInventory.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Resource.deleteMany({});
  await RequestResource.deleteMany({});
  await RequestAssignment.deleteMany({});
  await Organization.deleteMany({});
  await ResourceInventory.deleteMany({});
});

describe('Request Claim & RequestAssignment Integration', () => {
  it('should automatically create a RequestAssignment when a verified request is claimed', async () => {
    // 1. Create admin and volunteer users
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const volunteer = await User.create({
      name: 'Field Volunteer',
      email: 'volunteer@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const adminToken = createAuthToken(admin._id.toString(), 'admin');
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');

    // 2. Submit a request
    const subRes = await request(app).post('/api/requests').send({
      category: 'medical',
      description: 'Patient trapped with broken leg',
      preciseLat: 30.901,
      preciseLng: 75.8573,
      contactPhone: '+91 98765 43210',
    });
    const requestId = subRes.body.requestId;

    // 3. Admin verifies request
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Verified by phone call' });
    expect(verifyRes.status).toBe(200);

    // 4. Volunteer claims request
    const claimRes = await request(app)
      .patch(`/api/requests/${requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Responding with first aid unit' });

    expect(claimRes.status).toBe(200);
    // Preserves Phase 1 response shape exactly
    expect(claimRes.body.message).toContain('claimed successfully');
    expect(claimRes.body.request).toBeDefined();
    expect(claimRes.body.request.status).toBe('in_progress');
    expect(claimRes.body.request.claimedBy).toBeDefined();

    // 5. Verify RequestAssignment record was created behind the scenes
    const reqDoc = await RequestModel.findOne({ requestId });
    const assignments = await RequestAssignment.find({ request: reqDoc?._id });

    expect(assignments.length).toBe(1);
    const assignment = assignments[0];
    expect(assignment.assignedTo.toString()).toBe(volunteer._id.toString());
    expect(assignment.assignedBy.toString()).toBe(volunteer._id.toString());
    expect(assignment.status).toBe('assigned');
    expect(assignment.role).toBe('lead');
    expect(assignment.assignedAt).toBeDefined();

    // 6. Verify Time-to-Match measurement capability:
    // Difference between verifiedAt timestamp in statusHistory and assignedAt in RequestAssignment
    const verifiedEntry = reqDoc?.statusHistory.find((h) => h.status === 'verified');
    expect(verifiedEntry).toBeDefined();
    const timeToMatchMs = assignment.assignedAt.getTime() - verifiedEntry!.changedAt.getTime();
    expect(timeToMatchMs).toBeGreaterThanOrEqual(0);

    // 7. Resolve request -> verify assignment is completed
    const resolveRes = await request(app)
      .patch(`/api/requests/${requestId}/resolve`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Patient evacuated to hospital' });

    expect(resolveRes.status).toBe(200);
    const updatedAssignment = await RequestAssignment.findById(assignment._id);
    expect(updatedAssignment?.status).toBe('completed');
    expect(updatedAssignment?.completedAt).toBeDefined();
  });
});

describe('Resource Allocation: Partial vs. Full Fulfillment', () => {
  it('should correctly transition from unallocated -> partially_allocated -> fully_allocated across split contributions', async () => {
    // 1. Create users
    const ngo1 = await User.create({
      name: 'Punjab Relief NGO',
      email: 'ngo1@punjabrelief.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const ngo2 = await User.create({
      name: 'City Care NGO',
      email: 'ngo2@citycare.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const provider = await User.create({
      name: 'Medical Warehouse Depot',
      email: 'depot@medical.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });

    const tokenNgo1 = createAuthToken(ngo1._id.toString(), 'ngo');
    const tokenNgo2 = createAuthToken(ngo2._id.toString(), 'ngo');
    const tokenProvider = createAuthToken(provider._id.toString(), 'resource_provider');

    // 2. Create Resources
    const waterResource = await Resource.create({
      name: 'Clean Drinking Water (20L Can)',
      category: 'supplies',
      unit: 'cans',
      ownerType: 'User',
      ownerId: ngo1._id,
    });

    const kitResource = await Resource.create({
      name: 'First Aid Trauma Kit',
      category: 'medical',
      unit: 'kits',
      ownerType: 'User',
      ownerId: provider._id,
    });

    // 2b. Create Depot Stock (ResourceInventory) for the allocating responders
    const invNgo1 = await ResourceInventory.create({
      resource: waterResource._id,
      ownerType: 'User',
      ownerId: ngo1._id,
      quantityAvailable: 35,
      quantityReserved: 0,
    });

    const invNgo2 = await ResourceInventory.create({
      resource: waterResource._id,
      ownerType: 'User',
      ownerId: ngo2._id,
      quantityAvailable: 40,
      quantityReserved: 0,
    });

    const invProvider = await ResourceInventory.create({
      resource: kitResource._id,
      ownerType: 'User',
      ownerId: provider._id,
      quantityAvailable: 15,
      quantityReserved: 0,
    });

    // 3. Create Emergency Request
    const subRes = await request(app).post('/api/requests').send({
      category: 'supplies',
      description: 'Displaced community of 40 families in temporary shelter',
      preciseLat: 30.895,
      preciseLng: 75.845,
      contactPhone: '+91 91234 56789',
    });
    const requestId = subRes.body.requestId;

    // 4. Associate resource requirements to the request (authenticated via requester contactPhone):
    // Requirement 1: 50 water cans
    const reqWaterRes = await request(app)
      .post(`/api/requests/${requestId}/resources`)
      .send({
        resourceId: waterResource._id.toString(),
        quantityRequested: 50,
        contactPhone: '+91 91234 56789',
      });
    expect(reqWaterRes.status).toBe(201);
    expect(reqWaterRes.body.requestResource.quantityRequested).toBe(50);
    expect(reqWaterRes.body.requestResource.status).toBe('pending');

    // Requirement 2: 10 trauma kits
    const reqKitRes = await request(app)
      .post(`/api/requests/${requestId}/resources`)
      .send({
        resourceId: kitResource._id.toString(),
        quantityRequested: 10,
        contactPhone: '+91 91234 56789',
      });
    expect(reqKitRes.status).toBe(201);

    // Initial overall allocation status should be 'unallocated'
    const initAllocRes = await request(app).get(`/api/requests/${requestId}/allocation`);
    expect(initAllocRes.status).toBe(200);
    expect(initAllocRes.body.allocationStatus).toBe('unallocated');
    expect(initAllocRes.body.totalRequired).toBe(60);
    expect(initAllocRes.body.totalAllocated).toBe(0);

    // 5. Partial Assignment 1: NGO 1 contributes 20 water cans (out of 50 needed)
    const alloc1Res = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${tokenNgo1}`)
      .send({
        resourceId: waterResource._id.toString(),
        quantity: 20,
        notes: 'Dispatching 20 water cans from central depot',
      });

    expect(alloc1Res.status).toBe(200);
    expect(alloc1Res.body.requestResource.quantityAllocated).toBe(20);
    expect(alloc1Res.body.requestResource.status).toBe('partially_allocated');
    expect(alloc1Res.body.overallAllocation).toBe('partially_allocated');
    expect(alloc1Res.body.assignment.quantityAllocated).toBe(20);

    // Verify NGO 1's real depot stock decreased and reserved increased
    const checkInvNgo1 = await ResourceInventory.findById(invNgo1._id);
    expect(checkInvNgo1?.quantityAvailable).toBe(15); // 35 - 20 = 15
    expect(checkInvNgo1?.quantityReserved).toBe(20);

    // 6. Partial Assignment 2: NGO 2 contributes the remaining 30 water cans
    const alloc2Res = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${tokenNgo2}`)
      .send({
        resourceId: waterResource._id.toString(),
        quantity: 30,
        notes: 'Dispatching 30 water cans from northern hub',
      });

    expect(alloc2Res.status).toBe(200);
    // Water requirement is now 50/50 -> fully_allocated!
    expect(alloc2Res.body.requestResource.quantityAllocated).toBe(50);
    expect(alloc2Res.body.requestResource.status).toBe('fully_allocated');
    expect(alloc2Res.body.overallAllocation).toBe('partially_allocated');

    // Verify NGO 2's real depot stock decreased
    const checkInvNgo2 = await ResourceInventory.findById(invNgo2._id);
    expect(checkInvNgo2?.quantityAvailable).toBe(10); // 40 - 30 = 10
    expect(checkInvNgo2?.quantityReserved).toBe(30);

    // 7. Full Assignment: Provider contributes all 10 trauma kits
    const alloc3Res = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${tokenProvider}`)
      .send({
        resourceId: kitResource._id.toString(),
        quantity: 10,
        notes: 'Delivering 10 trauma kits via medical van',
      });

    expect(alloc3Res.status).toBe(200);
    expect(alloc3Res.body.requestResource.quantityAllocated).toBe(10);
    expect(alloc3Res.body.requestResource.status).toBe('fully_allocated');
    expect(alloc3Res.body.overallAllocation).toBe('fully_allocated');

    // Verify Provider's real depot stock decreased
    const checkInvProvider = await ResourceInventory.findById(invProvider._id);
    expect(checkInvProvider?.quantityAvailable).toBe(5); // 15 - 10 = 5
    expect(checkInvProvider?.quantityReserved).toBe(10);

    // 8. Verify the final overall allocation endpoint output
    const finalAllocRes = await request(app).get(`/api/requests/${requestId}/allocation`);
    expect(finalAllocRes.status).toBe(200);
    expect(finalAllocRes.body.allocationStatus).toBe('fully_allocated');
    expect(finalAllocRes.body.totalRequired).toBe(60);
    expect(finalAllocRes.body.totalAllocated).toBe(60);
    expect(finalAllocRes.body.resources.length).toBe(2);

    // 9. Verify 3 distinct RequestAssignment documents were logged for auditing
    const reqDoc = await RequestModel.findOne({ requestId });
    const allAssignments = await RequestAssignment.find({ request: reqDoc?._id });
    expect(allAssignments.length).toBe(3);
  });

  it('should reject allocation when requested quantity exceeds available inventory in stock', async () => {
    const ngo = await User.create({
      name: 'Relief Agency',
      email: 'relief@agency.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(ngo._id.toString(), 'ngo');

    const resource = await Resource.create({
      name: 'Baby Formula Milk',
      category: 'supplies',
      unit: 'tins',
      ownerType: 'User',
      ownerId: ngo._id,
    });

    // Real inventory has only 5 available
    const inventory = await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: ngo._id,
      quantityAvailable: 5,
      quantityReserved: 0,
    });

    const subRes = await request(app).post('/api/requests').send({
      category: 'supplies',
      description: 'Infants need baby formula urgently',
      preciseLat: 30.9,
      preciseLng: 75.85,
    });
    const requestId = subRes.body.requestId;

    // Attempt to allocate 10 when only 5 are in stock
    const allocRes = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: resource._id.toString(),
        quantity: 10,
      });

    expect(allocRes.status).toBe(400);
    expect(allocRes.body.error).toContain('Insufficient available inventory');

    // Verify inventory untouched
    const checkInv = await ResourceInventory.findById(inventory._id);
    expect(checkInv?.quantityAvailable).toBe(5);
    expect(checkInv?.quantityReserved).toBe(0);
  });

  it('should reject allocation when responder has no registered inventory for that resource', async () => {
    const provider = await User.create({
      name: 'Stockless Provider',
      email: 'empty@provider.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });
    const token = createAuthToken(provider._id.toString(), 'resource_provider');

    const resource = await Resource.create({
      name: 'Tents',
      category: 'shelter',
      unit: 'tents',
      ownerType: 'User',
      ownerId: provider._id,
    });

    const subRes = await request(app).post('/api/requests').send({
      category: 'shelter',
      description: 'Need 2 tents',
      preciseLat: 30.9,
      preciseLng: 75.85,
    });
    const requestId = subRes.body.requestId;

    // Attempt to allocate without any ResourceInventory record
    const allocRes = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: resource._id.toString(),
        quantity: 2,
      });

    expect(allocRes.status).toBe(400);
    expect(allocRes.body.error).toContain('No inventory record found');
  });

  it('should reject allocation from unauthorized roles: volunteer and admin receive 403 Forbidden', async () => {
    const volunteer = await User.create({
      name: 'Field Volunteer',
      email: 'vol@field.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const admin = await User.create({
      name: 'City Admin',
      email: 'admin@city.gov',
      passwordHash: 'dummyhash',
      role: 'admin',
    });

    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');
    const adminToken = createAuthToken(admin._id.toString(), 'admin');

    const resource = await Resource.create({
      name: 'Emergency Blankets',
      category: 'shelter',
      unit: 'bundles',
      ownerType: 'User',
      ownerId: admin._id,
    });

    const subRes = await request(app).post('/api/requests').send({
      category: 'shelter',
      description: 'Cold night, need blankets',
      preciseLat: 30.9,
      preciseLng: 75.85,
    });
    const requestId = subRes.body.requestId;

    // Volunteer attempt -> 403
    const volRes = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        resourceId: resource._id.toString(),
        quantity: 5,
      });
    expect(volRes.status).toBe(403);
    expect(volRes.body.error).toContain('Access forbidden');

    // Admin attempt -> 403
    const admRes = await request(app)
      .post(`/api/requests/${requestId}/allocate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        resourceId: resource._id.toString(),
        quantity: 5,
      });
    expect(admRes.status).toBe(403);
    expect(admRes.body.error).toContain('Access forbidden');
  });

  it('should allow a citizen / reporter to specify itemized resource needs without requiring mandatory prior authentication', async () => {
    // 1. Create owner and register a catalog resource
    const shelterNgo = await Organization.create({
      name: 'Ludhiana Shelter Relief Org',
      type: 'ngo',
    });

    const resItem = await Resource.create({
      name: 'Emergency Blankets (Wool)',
      category: 'shelter',
      unit: 'bundles',
      ownerType: 'Organization',
      ownerId: shelterNgo._id,
    });

    // 2. Submit emergency request anonymously
    const subRes = await request(app).post('/api/requests').send({
      category: 'shelter',
      description: 'Displaced flood survivors stranded in community school',
      preciseLat: 30.91,
      preciseLng: 75.85,
    });
    expect(subRes.status).toBe(201);
    const reqId = subRes.body.requestId;

    // 3. Associate itemized resource need without Bearer token
    const assocRes = await request(app)
      .post(`/api/requests/${reqId}/resources`)
      .send({
        resourceId: resItem._id.toString(),
        quantityRequested: 25,
      });

    expect(assocRes.status).toBe(201);
    expect(assocRes.body.requestResource.quantityRequested).toBe(25);
    expect(assocRes.body.requestResource.status).toBe('pending');

    // 4. Verify itemized retrieval via GET /api/requests/:id/resources
    const getRes = await request(app).get(`/api/requests/${reqId}/resources`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.resources.length).toBe(1);
    expect(getRes.body.resources[0].resource.name).toBe('Emergency Blankets (Wool)');
    expect(getRes.body.resources[0].quantityRequested).toBe(25);
    expect(getRes.body.resources[0].quantityAllocated).toBe(0);
  });

  describe('Resource Requirement Authorization on Requests (POST /api/requests/:id/resources)', () => {
    it('should reject an unrelated authenticated user and an unauthenticated stranger', async () => {
      // 1. Create original requester and unrelated users
      const requester = await User.create({
        name: 'Original Requester',
        email: 'requester@family.org',
        passwordHash: 'dummyhash',
        role: 'affected_person',
      });
      const unrelatedUser = await User.create({
        name: 'Unrelated Volunteer',
        email: 'unrelated@volunteer.org',
        passwordHash: 'dummyhash',
        role: 'volunteer',
      });

      const unrelatedToken = createAuthToken(unrelatedUser._id.toString(), 'volunteer');

      // 2. Requester creates request
      const reqDoc = await RequestModel.create({
        category: 'medical',
        description: 'Need insulin immediately',
        status: 'verified',
        location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
        createdBy: requester._id,
        contactPhone: '+91 98888 77777',
      });

      const resource = await Resource.create({
        name: 'Insulin Vials',
        category: 'medical',
        unit: 'vials',
        ownerType: 'User',
        ownerId: requester._id,
      });

      // Attempt 1: Unrelated authenticated user -> 403 Forbidden
      const unauthRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 5,
        });

      expect(unauthRes.status).toBe(403);
      expect(unauthRes.body.error).toContain('Access denied');

      // Attempt 2: Completely unauthenticated stranger without phone -> 403 Forbidden
      const strangerRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 10,
        });

      expect(strangerRes.status).toBe(403);
      expect(strangerRes.body.error).toContain('Access denied');

      // Attempt 3: Stranger with WRONG phone number -> 403 Forbidden
      const wrongPhoneRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 10,
          contactPhone: '+91 99999 00000',
        });

      expect(wrongPhoneRes.status).toBe(403);
      expect(wrongPhoneRes.body.error).toContain('Access denied');
    });

    it('should allow the authenticated original requester to append resource requirements', async () => {
      const requester = await User.create({
        name: 'Auth Requester',
        email: 'authreq@resq.org',
        passwordHash: 'dummyhash',
        role: 'affected_person',
      });
      const requesterToken = createAuthToken(requester._id.toString(), 'affected_person');

      const reqDoc = await RequestModel.create({
        category: 'supplies',
        description: 'Need food rations for community center',
        status: 'verified',
        location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
        createdBy: requester._id,
      });

      const resource = await Resource.create({
        name: 'Ration Pack',
        category: 'supplies',
        unit: 'packs',
        ownerType: 'User',
        ownerId: requester._id,
      });

      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 20,
        });

      expect(res.status).toBe(201);
      expect(res.body.requestResource.quantityRequested).toBe(20);
    });

    it('should allow an anonymous requester with matching contactPhone to append requirements', async () => {
      const reqDoc = await RequestModel.create({
        category: 'supplies',
        description: 'Anonymous report of water shortage',
        status: 'unverified',
        location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
        contactPhone: '+91 98765 43210',
      });

      const resource = await Resource.create({
        name: 'Water Canister',
        category: 'supplies',
        unit: 'canisters',
        ownerType: 'User',
        ownerId: reqDoc._id,
      });

      // Anonymous requester provides matching normalized phone
      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 15,
          contactPhone: '9876543210', // matching despite spacing/country code diff
        });

      expect(res.status).toBe(201);
      expect(res.body.requestResource.quantityRequested).toBe(15);
    });

    it('should allow an admin and the assigned claimant to append or update requirements', async () => {
      const admin = await User.create({
        name: 'Dispatch Coordinator',
        email: 'dispatch@resq.gov',
        passwordHash: 'dummyhash',
        role: 'admin',
      });
      const responder = await User.create({
        name: 'Assigned Responder',
        email: 'responder@rescue.org',
        passwordHash: 'dummyhash',
        role: 'volunteer',
      });

      const adminToken = createAuthToken(admin._id.toString(), 'admin');
      const responderToken = createAuthToken(responder._id.toString(), 'volunteer');

      const reqDoc = await RequestModel.create({
        category: 'rescue',
        description: 'People stranded on roof',
        status: 'in_progress',
        location: { publicLat: 30.9, publicLng: 75.8, preciseLat: 30.9, preciseLng: 75.8 },
        claimedBy: responder._id,
        contactPhone: '+91 91111 22222',
      });

      const resource = await Resource.create({
        name: 'Inflatable Lifeboat',
        category: 'rescue',
        unit: 'boats',
        ownerType: 'User',
        ownerId: admin._id,
      });

      // 1. Admin adds 2 lifeboats
      const adminRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 2,
        });

      expect(adminRes.status).toBe(201);
      expect(adminRes.body.requestResource.quantityRequested).toBe(2);

      // 2. Assigned Claimant adds 1 more lifeboat on scene
      const claimantRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/resources`)
        .set('Authorization', `Bearer ${responderToken}`)
        .send({
          resourceId: resource._id.toString(),
          quantityRequested: 1,
        });

      expect(claimantRes.status).toBe(201);
      expect(claimantRes.body.requestResource.quantityRequested).toBe(3); // 2 + 1 = 3
    });
  });
});
