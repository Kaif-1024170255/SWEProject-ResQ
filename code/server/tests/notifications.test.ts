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
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-notifications-tests';

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
  await Notification.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Notification.deleteMany({});
});

describe('Automatic Notifications on Lifecycle Events', () => {
  it('should generate notifications for requester on verify, claim, and resolve events', async () => {
    // 1. Create Requester, Admin, and Volunteer
    const requester = await User.create({
      name: 'Amrita Devi',
      email: 'amrita@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const volunteer = await User.create({
      name: 'Rahul Volunteer',
      email: 'rahul@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const requesterToken = createAuthToken(requester._id.toString(), 'affected_person');
    const adminToken = createAuthToken(admin._id.toString(), 'admin');
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');

    // 2. Requester submits an emergency request
    const subRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        category: 'medical',
        description: 'Urgent insulin needed in waterlogged sector',
        preciseLat: 30.901,
        preciseLng: 75.8573,
        contactPhone: '+91 98765 11111',
      });

    expect(subRes.status).toBe(201);
    const requestId = subRes.body.requestId;

    // No notifications generated yet for requester
    let notifications = await Notification.find({ recipient: requester._id });
    expect(notifications.length).toBe(0);

    // 3. Admin verifies request -> Trigger 1: request_verified
    const verifyRes = await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ remarks: 'Verified by telephone call' });

    expect(verifyRes.status).toBe(200);

    notifications = await Notification.find({ recipient: requester._id });
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe('request_verified');
    expect(notifications[0].title).toBe('Request Verified');
    expect(notifications[0].isRead).toBe(false);
    expect(notifications[0].message).toContain(requestId);

    // 4. Volunteer claims request -> Trigger 2: request_claimed
    const claimRes = await request(app)
      .patch(`/api/requests/${requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'En route with medical kit' });

    expect(claimRes.status).toBe(200);

    notifications = await Notification.find({ recipient: requester._id }).sort({ createdAt: 1 });
    expect(notifications.length).toBe(2);
    expect(notifications[1].type).toBe('request_claimed');
    expect(notifications[1].title).toBe('Responder Assigned');
    expect(notifications[1].isRead).toBe(false);

    // 5. Volunteer resolves request -> Trigger 3: request_resolved
    const resolveRes = await request(app)
      .patch(`/api/requests/${requestId}/resolve`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'Insulin delivered successfully' });

    expect(resolveRes.status).toBe(200);

    notifications = await Notification.find({ recipient: requester._id }).sort({ createdAt: 1 });
    expect(notifications.length).toBe(3);
    expect(notifications[2].type).toBe('request_resolved');
    expect(notifications[2].title).toBe('Request Marked Resolved');
    expect(notifications[2].isRead).toBe(false);

    // Verify other users (admin, volunteer) received 0 notifications meant for requester
    const adminNotifs = await Notification.find({ recipient: admin._id });
    expect(adminNotifs.length).toBe(0);
  });

  it('should not throw error or create orphan notifications for anonymous submissions', async () => {
    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin2@resq.org',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const volunteer = await User.create({
      name: 'Field Volunteer',
      email: 'volunteer2@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });

    const adminToken = createAuthToken(admin._id.toString(), 'admin');
    const volunteerToken = createAuthToken(volunteer._id.toString(), 'volunteer');

    // Anonymous submission (no token)
    const subRes = await request(app).post('/api/requests').send({
      category: 'supplies',
      description: 'Anonymous report of water shortage',
      preciseLat: 30.901,
      preciseLng: 75.8573,
      contactPhone: '+91 99999 00000',
    });
    const requestId = subRes.body.requestId;

    // Verify and claim
    await request(app)
      .patch(`/api/requests/${requestId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    await request(app)
      .patch(`/api/requests/${requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send();

    await request(app)
      .patch(`/api/requests/${requestId}/resolve`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send();

    const totalNotifications = await Notification.countDocuments({});
    expect(totalNotifications).toBe(0);
  });
});

describe('Notification API Endpoints', () => {
  it('should fetch user notifications with unreadCount and support marking as read', async () => {
    const user = await User.create({
      name: 'Test Citizen',
      email: 'citizen@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const token = createAuthToken(user._id.toString(), 'affected_person');

    // Seed 2 notifications
    const n1 = await Notification.create({
      recipient: user._id,
      type: 'request_verified',
      title: 'Request Verified',
      message: 'REQ-2026-000001 verified',
      isRead: false,
    });

    const n2 = await Notification.create({
      recipient: user._id,
      type: 'request_claimed',
      title: 'Responder Assigned',
      message: 'REQ-2026-000001 claimed by responder',
      isRead: false,
    });

    // 1. Fetch notifications
    const getRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.unreadCount).toBe(2);
    expect(getRes.body.notifications.length).toBe(2);

    // 2. Mark n1 as read
    const readRes = await request(app)
      .patch(`/api/notifications/${n1._id}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.notification.isRead).toBe(true);
    expect(readRes.body.notification.readAt).toBeDefined();

    // 3. Fetch notifications again -> unreadCount should be 1
    const checkRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(checkRes.status).toBe(200);
    expect(checkRes.body.unreadCount).toBe(1);

    // 4. Mark all as read
    const readAllRes = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(readAllRes.status).toBe(200);

    const finalRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(finalRes.status).toBe(200);
    expect(finalRes.body.unreadCount).toBe(0);
  });
});
