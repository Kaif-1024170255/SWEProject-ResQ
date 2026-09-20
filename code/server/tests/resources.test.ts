import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Organization,
  Resource,
  ResourceInventory,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-resources-tests';

function createAuthToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await Organization.syncIndexes();
  await Resource.syncIndexes();
  await ResourceInventory.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Organization.deleteMany({});
  await Resource.deleteMany({});
  await ResourceInventory.deleteMany({});
});

describe('Organization Management Endpoints', () => {
  it('should create an organization and link it to user when user has no organization', async () => {
    const user = await User.create({
      name: 'NGO Coordinator',
      email: 'coordinator@punjabngo.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });

    const token = createAuthToken(user._id.toString(), 'ngo');

    const res = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Punjab Relief Coalition',
        type: 'ngo',
        registrationNumber: 'NGO-PB-2026-99',
        contactEmail: 'contact@punjabngo.org',
        contactPhone: '+91 98765 11111',
        operatingRegion: 'Ludhiana Central',
        address: 'Civil Lines, Ludhiana',
      });

    expect(res.status).toBe(201);
    expect(res.body.organization).toBeDefined();
    expect(res.body.organization.name).toBe('Punjab Relief Coalition');
    expect(res.body.organization.type).toBe('ngo');
    expect(res.body.organization.isVerified).toBe(false);
    expect(res.body.organization.primaryContact).toBe(user._id.toString());

    // Verify user's organizationId was set
    const updatedUser = await User.findById(user._id);
    expect(updatedUser?.organizationId?.toString()).toBe(res.body.organization._id);
  });

  it('should reject creating an organization with duplicate name', async () => {
    const user = await User.create({
      name: 'Admin User',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const token = createAuthToken(user._id.toString(), 'admin');

    await Organization.create({
      name: 'Red Cross Ludhiana',
      type: 'ngo',
    });

    const res = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Red Cross Ludhiana',
        type: 'ngo',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already exists');
  });

  it('should reject creating an organization with invalid type', async () => {
    const user = await User.create({
      name: 'NGO User',
      email: 'ngo@example.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(user._id.toString(), 'ngo');

    const res = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Valid Name Org',
        type: 'invalid_type_here',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid organization type');
  });

  it('should list and retrieve organizations', async () => {
    const org1 = await Organization.create({
      name: 'Civil Hospital Ludhiana',
      type: 'hospital',
      operatingRegion: 'Ludhiana North',
    });

    const org2 = await Organization.create({
      name: 'City Fire & Rescue',
      type: 'government',
      operatingRegion: 'Ludhiana South',
    });

    // List all
    const listRes = await request(app).get('/api/organizations');
    expect(listRes.status).toBe(200);
    expect(listRes.body.organizations.length).toBe(2);

    // Filter by type
    const filterRes = await request(app).get('/api/organizations?type=hospital');
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.organizations.length).toBe(1);
    expect(filterRes.body.organizations[0].name).toBe('Civil Hospital Ludhiana');

    // Get single
    const singleRes = await request(app).get(`/api/organizations/${org2._id}`);
    expect(singleRes.status).toBe(200);
    expect(singleRes.body.organization.name).toBe('City Fire & Rescue');
  });

  it('should allow primary contact to update their own organization via POST /api/organizations', async () => {
    const user = await User.create({
      name: 'Khalsa Leader',
      email: 'leader@khalsa.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(user._id.toString(), 'ngo');

    // 1. Initial creation
    const createRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Khalsa Aid Central',
        type: 'ngo',
        operatingRegion: 'Punjab North',
        contactPhone: '+91 98888 11111',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.organization.name).toBe('Khalsa Aid Central');

    // 2. Subsequent update via POST /api/organizations
    const updateRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Khalsa Aid Central (Updated)',
        type: 'ngo',
        operatingRegion: 'All Punjab Sectors',
        contactPhone: '+91 98888 22222',
        address: 'Main Logistics Depot, GT Road',
        registrationNumber: 'KA-2026-REG',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.message).toContain('updated successfully');
    expect(updateRes.body.organization.name).toBe('Khalsa Aid Central (Updated)');
    expect(updateRes.body.organization.operatingRegion).toBe('All Punjab Sectors');
    expect(updateRes.body.organization.address).toBe('Main Logistics Depot, GT Road');
    expect(updateRes.body.organization.registrationNumber).toBe('KA-2026-REG');
  });
});

describe('Resource Registration Endpoints', () => {
  it('should register a resource against an Organization with initial inventory', async () => {
    const user = await User.create({
      name: 'Resource Manager',
      email: 'manager@supplies.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });
    const token = createAuthToken(user._id.toString(), 'resource_provider');

    const org = await Organization.create({
      name: 'Disaster Logistics Hub',
      type: 'supplier',
      operatingRegion: 'Sector 4',
      primaryContact: user._id,
    });

    const res = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Water Tanker (5000L)',
        category: 'supplies',
        unit: 'liters',
        description: 'Potable water tanker with pump attachment',
        organizationId: org._id.toString(),
        initialQuantity: 15000,
        isPerishable: false,
        notes: 'Stationed at Central Depot',
      });

    expect(res.status).toBe(201);
    expect(res.body.resource).toBeDefined();
    expect(res.body.resource.name).toBe('Water Tanker (5000L)');
    expect(res.body.resource.ownerType).toBe('Organization');
    expect(res.body.resource.ownerId).toBe(org._id.toString());

    // Verify corresponding inventory was created
    expect(res.body.inventory).toBeDefined();
    expect(res.body.inventory.quantityAvailable).toBe(15000);
    expect(res.body.inventory.quantityReserved).toBe(0);
    expect(res.body.inventory.status).toBe('available');
  });

  it('should reject registering a resource under an organization the user does not belong to', async () => {
    const user = await User.create({
      name: 'Unrelated Provider',
      email: 'unrelated@provider.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });
    const token = createAuthToken(user._id.toString(), 'resource_provider');

    const org = await Organization.create({
      name: 'Red Cross Depot',
      type: 'ngo',
      operatingRegion: 'Sector 9',
    });

    const res = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Rescue Ropes',
        category: 'rescue',
        unit: 'meters',
        organizationId: org._id.toString(),
        initialQuantity: 100,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  it('should register a resource against an individual provider without an organization', async () => {
    const user = await User.create({
      name: 'Private Ambulance Driver',
      email: 'driver@ambulance.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });
    const token = createAuthToken(user._id.toString(), 'resource_provider');

    const res = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Basic Life Support Ambulance',
        category: 'medical',
        unit: 'vehicles',
        initialQuantity: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.resource.ownerType).toBe('User');
    expect(res.body.resource.ownerId).toBe(user._id.toString());
    expect(res.body.inventory.quantityAvailable).toBe(1);
    expect(res.body.inventory.ownerType).toBe('User');
  });

  it('should reject resource registration if required fields are missing', async () => {
    const user = await User.create({
      name: 'Provider User',
      email: 'provider@example.org',
      passwordHash: 'dummyhash',
      role: 'resource_provider',
    });
    const token = createAuthToken(user._id.toString(), 'resource_provider');

    const res = await request(app)
      .post('/api/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Incomplete Resource',
        // missing category and unit
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('category is required');
  });
});

describe('Resource Inventory & Reserve/Release Operations', () => {
  it('should reserve inventory correctly and update available/reserved quantities', async () => {
    const user = await User.create({
      name: 'Dispatcher User',
      email: 'dispatcher@punjabrelief.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(user._id.toString(), 'ngo');

    const org = await Organization.create({
      name: 'Medical Aid Trust',
      type: 'ngo',
    });

    const resource = await Resource.create({
      name: 'Emergency Trauma Kit',
      category: 'medical',
      unit: 'kits',
      ownerType: 'Organization',
      ownerId: org._id,
    });

    const inventory = await ResourceInventory.create({
      resource: resource._id,
      organization: org._id,
      ownerType: 'Organization',
      ownerId: org._id,
      quantityAvailable: 50,
      quantityReserved: 0,
    });

    // 1. Reserve 20 kits
    const reserveRes = await request(app)
      .post(`/api/inventory/${inventory._id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 20 });

    expect(reserveRes.status).toBe(200);
    expect(reserveRes.body.inventory.quantityAvailable).toBe(30);
    expect(reserveRes.body.inventory.quantityReserved).toBe(20);
    expect(reserveRes.body.inventory.status).toBe('available');

    // 2. Reserve remaining 30 kits -> status becomes depleted
    const reserveAllRes = await request(app)
      .post(`/api/inventory/${inventory._id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 30 });

    expect(reserveAllRes.status).toBe(200);
    expect(reserveAllRes.body.inventory.quantityAvailable).toBe(0);
    expect(reserveAllRes.body.inventory.quantityReserved).toBe(50);
    expect(reserveAllRes.body.inventory.status).toBe('depleted');
  });

  it('should reject reserving more quantity than available', async () => {
    const user = await User.create({
      name: 'NGO Depot Manager',
      email: 'depotmanager@example.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(user._id.toString(), 'ngo');

    const resource = await Resource.create({
      name: 'Diesel Generator (10kVA)',
      category: 'supplies',
      unit: 'units',
      ownerType: 'User',
      ownerId: user._id,
    });

    const inventory = await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: user._id,
      quantityAvailable: 3,
      quantityReserved: 0,
    });

    // Attempt to reserve 5 when only 3 available
    const res = await request(app)
      .post(`/api/inventory/${inventory._id}/reserve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Insufficient available inventory');

    // Ensure database values are unchanged
    const check = await ResourceInventory.findById(inventory._id);
    expect(check?.quantityAvailable).toBe(3);
    expect(check?.quantityReserved).toBe(0);
  });

  it('should release reserved inventory correctly back to available', async () => {
    const user = await User.create({
      name: 'Coordinator',
      email: 'coord@relief.org',
      passwordHash: 'dummyhash',
      role: 'ngo',
    });
    const token = createAuthToken(user._id.toString(), 'ngo');

    const resource = await Resource.create({
      name: 'High-Capacity Water Filter',
      category: 'supplies',
      unit: 'units',
      ownerType: 'User',
      ownerId: user._id,
    });

    // Create inventory with 10 available and 15 reserved
    const inventory = await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: user._id,
      quantityAvailable: 10,
      quantityReserved: 15,
      status: 'available',
    });

    // Release 5 reserved items
    const releaseRes = await request(app)
      .post(`/api/inventory/${inventory._id}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 5 });

    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.inventory.quantityAvailable).toBe(15);
    expect(releaseRes.body.inventory.quantityReserved).toBe(10);

    // Releasing more than is currently reserved should fail
    const overReleaseRes = await request(app)
      .post(`/api/inventory/${inventory._id}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 20 });

    expect(overReleaseRes.status).toBe(400);
    expect(overReleaseRes.body.error).toContain('Cannot release');
  });

  it('should reject reserve and release from unauthorized roles: volunteer and affected_person receive 403 Forbidden', async () => {
    const volunteer = await User.create({
      name: 'Volunteer Res',
      email: 'volres@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const citizen = await User.create({
      name: 'Citizen Res',
      email: 'citres@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });

    const volToken = createAuthToken(volunteer._id.toString(), 'volunteer');
    const citToken = createAuthToken(citizen._id.toString(), 'affected_person');

    const resource = await Resource.create({
      name: 'Blanket Stack',
      category: 'shelter',
      unit: 'stacks',
      ownerType: 'User',
      ownerId: volunteer._id,
    });

    const inventory = await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: volunteer._id,
      quantityAvailable: 10,
      quantityReserved: 5,
    });

    // Volunteer calling reserve -> 403
    const volReserve = await request(app)
      .post(`/api/inventory/${inventory._id}/reserve`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({ quantity: 2 });
    expect(volReserve.status).toBe(403);
    expect(volReserve.body.error).toContain('Access forbidden');

    // Citizen calling reserve -> 403
    const citReserve = await request(app)
      .post(`/api/inventory/${inventory._id}/reserve`)
      .set('Authorization', `Bearer ${citToken}`)
      .send({ quantity: 2 });
    expect(citReserve.status).toBe(403);
    expect(citReserve.body.error).toContain('Access forbidden');

    // Volunteer calling release -> 403
    const volRelease = await request(app)
      .post(`/api/inventory/${inventory._id}/release`)
      .set('Authorization', `Bearer ${volToken}`)
      .send({ quantity: 2 });
    expect(volRelease.status).toBe(403);
    expect(volRelease.body.error).toContain('Access forbidden');

    // Citizen calling release -> 403
    const citRelease = await request(app)
      .post(`/api/inventory/${inventory._id}/release`)
      .set('Authorization', `Bearer ${citToken}`)
      .send({ quantity: 2 });
    expect(citRelease.status).toBe(403);
    expect(citRelease.body.error).toContain('Access forbidden');
  });

  it('should view inventory with filters and populates', async () => {
    const org = await Organization.create({
      name: 'Regional NGO Warehouse',
      type: 'ngo',
      operatingRegion: 'Ludhiana West',
    });

    const res1 = await Resource.create({
      name: 'Tarpaulin Sheets',
      category: 'shelter',
      unit: 'units',
      ownerType: 'Organization',
      ownerId: org._id,
    });

    await ResourceInventory.create({
      resource: res1._id,
      organization: org._id,
      ownerType: 'Organization',
      ownerId: org._id,
      quantityAvailable: 100,
      quantityReserved: 10,
    });

    const res = await request(app)
      .get(`/api/inventory?organizationId=${org._id.toString()}`);

    expect(res.status).toBe(200);
    expect(res.body.inventory.length).toBe(1);
    expect(res.body.inventory[0].resource.name).toBe('Tarpaulin Sheets');
    expect(res.body.inventory[0].organization.name).toBe('Regional NGO Warehouse');
  });
});
