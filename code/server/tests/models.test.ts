import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { User, Request, calculateFuzzedCoordinates } from '../src/models';
import { seedDatabase } from '../src/seed';

let mongoServer: MongoMemoryServer;

function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await Request.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Request.deleteMany({});
});

describe('User Model', () => {
  it('should create a valid user with a recognized role', async () => {
    const user = await User.create({
      name: 'Test Volunteer',
      email: 'volunteer@example.com',
      passwordHash: 'hashed_pw_sample',
      role: 'volunteer',
    });

    expect(user._id).toBeDefined();
    expect(user.role).toBe('volunteer');
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  it('should reject invalid user roles', async () => {
    await expect(
      User.create({
        name: 'Invalid Role User',
        email: 'invalid@example.com',
        passwordHash: 'hashed_pw',
        // @ts-expect-error Testing runtime validation for invalid role
        role: 'superhero',
      })
    ).rejects.toThrow();
  });

  it('should enforce unique email addresses', async () => {
    await User.create({
      name: 'First User',
      email: 'unique@example.com',
      passwordHash: 'hashed_pw',
      role: 'affected_person',
    });

    await expect(
      User.create({
        name: 'Second User',
        email: 'unique@example.com',
        passwordHash: 'hashed_pw_2',
        role: 'volunteer',
      })
    ).rejects.toThrow();
  });
});

describe('Request Model', () => {
  it('should auto-generate a formatted requestId and auto-fuzz public coordinates', async () => {
    const preciseLat = 30.901;
    const preciseLng = 75.8573;

    const request = await Request.create({
      category: 'medical',
      description: 'Urgent medical aid required',
      location: {
        preciseLat,
        preciseLng,
      },
      contactPhone: '+91 99999 88888',
    });

    expect(request.requestId).toMatch(/^REQ-\d{4}-\d{6}$/);
    expect(request.status).toBe('unverified');
    expect(request.location.publicLat).toBeDefined();
    expect(request.location.publicLng).toBeDefined();

    // Verify distance between precise and fuzzed public coordinates is ~200-450 meters
    const distance = haversineDistanceMeters(
      preciseLat,
      preciseLng,
      request.location.publicLat,
      request.location.publicLng
    );
    expect(distance).toBeGreaterThanOrEqual(180);
    expect(distance).toBeLessThanOrEqual(450);

    // Verify initial statusHistory was populated
    expect(request.statusHistory.length).toBe(1);
    expect(request.statusHistory[0].status).toBe('unverified');
  });

  it('should calculate fuzzed coordinates helper directly within 200m to 400m', () => {
    const lat = 30.901;
    const lng = 75.8573;
    const fuzzed = calculateFuzzedCoordinates(lat, lng);
    const dist = haversineDistanceMeters(lat, lng, fuzzed.publicLat, fuzzed.publicLng);
    expect(dist).toBeGreaterThanOrEqual(190);
    expect(dist).toBeLessThanOrEqual(420);
  });

  it('should allow anonymous bystander submissions with contact phone', async () => {
    const request = await Request.create({
      category: 'rescue',
      description: 'People stranded near underpass',
      location: {
        preciseLat: 30.895,
        preciseLng: 75.845,
      },
      contactPhone: '+91 91234 56789',
    });

    expect(request.createdBy).toBeUndefined();
    expect(request.contactPhone).toBe('+91 91234 56789');
  });

  it('should reject invalid category', async () => {
    await expect(
      Request.create({
        // @ts-expect-error Testing runtime validation
        category: 'unsupported_category',
        description: 'Testing invalid category',
        location: {
          preciseLat: 30.895,
          preciseLng: 75.845,
        },
      })
    ).rejects.toThrow();
  });
});

describe('Seed Script', () => {
  it('should successfully seed sample users across all roles and sample requests', async () => {
    const { users, requests } = await seedDatabase();

    expect(users.length).toBe(5);
    expect(requests.length).toBeGreaterThanOrEqual(5);

    const rolesFound = users.map((u) => u.role).sort();
    expect(rolesFound).toEqual([
      'admin',
      'affected_person',
      'ngo',
      'resource_provider',
      'volunteer',
    ]);

    const statusesFound = new Set(requests.map((r) => r.status));
    expect(statusesFound.has('unverified')).toBe(true);
    expect(statusesFound.has('in_progress')).toBe(true);
    expect(statusesFound.has('verified')).toBe(true);
    expect(statusesFound.has('resolved')).toBe(true);
    expect(statusesFound.has('closed')).toBe(true);
  });
});
