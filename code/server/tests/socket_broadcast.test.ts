import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { User, Request as RequestModel } from '../src/models';
import { initSocketIO } from '../src/socket';

describe('Real-Time Event Broadcasting with Privacy Redaction', () => {
  let mongoServer: MongoMemoryServer;
  let server: http.Server;
  let port: number;
  const TEST_SECRET = 'broadcast-test-secret-2026';

  let requesterUser: any;
  let requesterToken: string;

  let volunteerUser: any;
  let volunteerToken: string;

  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Create ephemeral HTTP server and attach Socket.IO
    server = http.createServer(app);
    initSocketIO(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        port = address.port;
        resolve();
      });
    });

    // Create test users
    requesterUser = await User.create({
      name: 'Simran Requester',
      email: 'simran@example.org',
      passwordHash: 'hashedpwd',
      role: 'affected_person',
    });
    requesterToken = jwt.sign(
      { userId: requesterUser._id.toString(), role: 'affected_person', name: requesterUser.name },
      TEST_SECRET
    );

    volunteerUser = await User.create({
      name: 'Harpreet Volunteer',
      email: 'harpreet@example.org',
      passwordHash: 'hashedpwd',
      role: 'volunteer',
    });
    volunteerToken = jwt.sign(
      { userId: volunteerUser._id.toString(), role: 'volunteer', name: volunteerUser.name },
      TEST_SECRET
    );

    adminUser = await User.create({
      name: 'Admin Dispatcher',
      email: 'admin@resq.test',
      passwordHash: 'hashedpwd',
      role: 'admin',
    });
    adminToken = jwt.sign(
      { userId: adminUser._id.toString(), role: 'admin', name: adminUser.name },
      TEST_SECRET
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('broadcasts request:created with sanitized coordinates to public room on request submission', async () => {
    const publicClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => publicClient.on('connect', () => resolve()));

    const createdPromise = new Promise<any>((resolve) => {
      publicClient.on('request:created', (data) => {
        resolve(data);
      });
    });

    // Submit new request via REST API
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        category: 'medical',
        description: 'First aid kits needed at community center',
        preciseLat: 30.9025,
        preciseLng: 75.8542,
        contactPhone: '+91 98888 12345',
      });

    expect(res.status).toBe(201);

    const received = await createdPromise;
    expect(received.request).toBeDefined();
    expect(received.request.status).toBe('unverified');

    // PRIVACY VERIFICATION: public broadcast MUST NOT contain preciseLat, preciseLng, or contactPhone
    expect(received.request.location.preciseLat).toBeUndefined();
    expect(received.request.location.preciseLng).toBeUndefined();
    expect(received.request.contactPhone).toBeUndefined();

    // Must contain public fuzzed coordinates
    expect(typeof received.request.location.publicLat).toBe('number');
    expect(typeof received.request.location.publicLng).toBe('number');

    publicClient.disconnect();
  });

  it('emits request:updated with privacy redaction when a request is claimed', async () => {
    // 1. Create a verified request in the database
    const reqDoc = await RequestModel.create({
      category: 'supplies',
      description: 'Clean drinking water bottles for evacuation center',
      location: {
        preciseLat: 30.8950,
        preciseLng: 75.8450,
      },
      status: 'verified',
      contactPhone: '+91 99999 88888',
      createdBy: requesterUser._id,
    });

    // 2. Client A: Non-claimant / anonymous listener in the public room
    const nonClaimantClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    // 3. Client B: The claimant volunteer who will claim the request
    const claimantClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: volunteerToken },
    });

    // 4. Client C: The requester waiting for notifications
    const requesterClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: requesterToken },
    });

    await Promise.all([
      new Promise<void>((resolve) => nonClaimantClient.on('connect', () => resolve())),
      new Promise<void>((resolve) => claimantClient.on('connect', () => resolve())),
      new Promise<void>((resolve) => requesterClient.on('connect', () => resolve())),
    ]);

    // Setup promises to capture emitted events
    const publicUpdatePromise = new Promise<any>((resolve) => {
      nonClaimantClient.on('request:updated', (data) => {
        if (data.request?.requestId === reqDoc.requestId) {
          resolve(data);
        }
      });
    });

    const claimantUpdatePromise = new Promise<any>((resolve) => {
      claimantClient.on('request:updated', (data) => {
        if (data.request?.requestId === reqDoc.requestId) {
          resolve(data);
        }
      });
    });

    const requesterNotifPromise = new Promise<any>((resolve) => {
      requesterClient.on('notification:new', (data) => {
        resolve(data);
      });
    });

    // 5. Volunteer claims the request via REST
    const claimRes = await request(app)
      .patch(`/api/requests/${reqDoc.requestId}/claim`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({ note: 'En route with water tanker' });

    expect(claimRes.status).toBe(200);

    // 6. Verify non-claimant received the public-safe update
    const publicUpdate = await publicUpdatePromise;
    expect(publicUpdate.request.status).toBe('in_progress');
    // CRITICAL PRIVACY ASSERTION: non-claimant MUST NOT receive precise coordinates or phone
    expect(publicUpdate.request.location.preciseLat).toBeUndefined();
    expect(publicUpdate.request.location.preciseLng).toBeUndefined();
    expect(publicUpdate.request.contactPhone).toBeUndefined();
    expect(publicUpdate.isPreciseLocationRevealed).toBeUndefined();

    // 7. Verify claimant received unredacted coordinates in their authorized room
    const claimantUpdate = await claimantUpdatePromise;
    expect(claimantUpdate.request.status).toBe('in_progress');
    expect(claimantUpdate.request.location.preciseLat).toBe(30.8950);
    expect(claimantUpdate.request.location.preciseLng).toBe(75.8450);
    expect(claimantUpdate.request.contactPhone).toBe('+91 99999 88888');
    expect(claimantUpdate.isPreciseLocationRevealed).toBe(true);

    // 8. Verify requester received notification:new event
    const notifEvent = await requesterNotifPromise;
    expect(notifEvent.notification).toBeDefined();
    expect(notifEvent.notification.type).toBe('request_claimed');
    expect(notifEvent.notification.recipient.toString()).toBe(requesterUser._id.toString());

    nonClaimantClient.disconnect();
    claimantClient.disconnect();
    requesterClient.disconnect();
  });

  it('does NOT emit any socket event if a database write fails', async () => {
    const testClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => testClient.on('connect', () => resolve()));

    let eventFired = false;
    testClient.on('request:created', () => {
      eventFired = true;
    });

    // Attempt invalid request creation (missing required fields)
    const failRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${requesterToken}`)
      .send({
        // Missing category, description, and coordinates
      });

    expect(failRes.status).toBe(400);

    // Allow a small delay to ensure no asynchronous event arrived
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(eventFired).toBe(false);

    testClient.disconnect();
  });

  it('broadcasts allocation:updated to request room and notification:new to recipient when a provider allocates resources', async () => {
    // 1. Create a provider user and a resource owned by them
    const { Resource, RequestResource, ResourceInventory } = await import('../src/models');
    const providerUser = await User.create({
      name: 'Oxfam Depot',
      email: 'provider@example.org',
      passwordHash: 'hashedpwd',
      role: 'resource_provider',
    });
    const providerToken = jwt.sign(
      { userId: providerUser._id.toString(), role: 'resource_provider', name: providerUser.name },
      TEST_SECRET
    );

    const resource = await Resource.create({
      name: 'Emergency Water Packs',
      category: 'water',
      unit: 'crates',
      ownerId: providerUser._id,
    });

    await ResourceInventory.create({
      resource: resource._id,
      ownerType: 'User',
      ownerId: providerUser._id,
      quantityAvailable: 10,
      quantityReserved: 0,
    });

    // 2. Create emergency request with resource requirement
    const testReq = await RequestModel.create({
      category: 'supplies',
      description: 'Need clean drinking water for community center',
      status: 'verified',
      location: {
        publicLat: 30.900,
        publicLng: 75.850,
        preciseLat: 30.901,
        preciseLng: 75.851,
      },
      createdBy: requesterUser._id,
    });

    await RequestResource.create({
      request: testReq._id,
      resource: resource._id,
      quantityRequested: 10,
      quantityAllocated: 0,
      status: 'pending',
    });

    // 3. Connect viewer client (simulating another session viewing the request details)
    const viewerClient: ClientSocket = Client(`http://localhost:${port}`, {
      auth: { token: volunteerToken },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) => viewerClient.on('connect', () => resolve()));

    // Subscribe to the request room
    await new Promise<void>((resolve) => {
      viewerClient.emit('subscribe:request', testReq.requestId, (res: any) => {
        expect(res?.status).toBe('ok');
        resolve();
      });
    });

    // Setup listener for allocation:updated
    const allocationPromise = new Promise<any>((resolve) => {
      viewerClient.on('allocation:updated', (data) => {
        resolve(data);
      });
    });

    // 4. Connect requester client to verify live in-app notification:new
    const requesterClient: ClientSocket = Client(`http://localhost:${port}`, {
      auth: { token: requesterToken },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) => requesterClient.on('connect', () => resolve()));

    const notifPromise = new Promise<any>((resolve) => {
      requesterClient.on('notification:new', (data) => {
        resolve(data);
      });
    });

    // 5. Provider allocates 4 units towards the request
    const allocateRes = await request(app)
      .post(`/api/requests/${testReq.requestId}/allocate`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        resourceId: resource._id.toString(),
        quantity: 4,
        notes: 'Dispatched from Northern Depot',
      });

    expect(allocateRes.status).toBe(200);

    // 6. Verify viewer received allocation:updated live
    const allocEvent = await allocationPromise;
    expect(allocEvent.requestId).toBe(testReq.requestId);
    expect(allocEvent.overallAllocation).toBe('partially_allocated');
    expect(allocEvent.totalRequired).toBe(10);
    expect(allocEvent.totalAllocated).toBe(4);
    expect(allocEvent.resources).toBeDefined();
    expect(allocEvent.resources.length).toBeGreaterThanOrEqual(1);
    expect(allocEvent.resources[0].quantityAllocated).toBe(4);

    // 7. Verify requester received notification:new live without refresh
    const notifEvent = await notifPromise;
    expect(notifEvent.notification).toBeDefined();
    expect(notifEvent.notification.title).toContain(testReq.requestId);
    expect(notifEvent.notification.message).toContain('4 crates of Emergency Water Packs');
    expect(notifEvent.notification.recipient.toString()).toBe(requesterUser._id.toString());

    viewerClient.disconnect();
    requesterClient.disconnect();
  });

  it('broadcasts message:new to authorized participants and rejects unauthorized volunteer', async () => {
    // 1. Create another volunteer who has NOT claimed this request
    const unauthorizedVolunteer = await User.create({
      name: 'Unassigned Volunteer',
      email: 'unassigned@example.org',
      passwordHash: 'hashedpwd',
      role: 'volunteer',
    });
    const unauthorizedToken = jwt.sign(
      { userId: unauthorizedVolunteer._id.toString(), role: 'volunteer', name: unauthorizedVolunteer.name },
      TEST_SECRET
    );

    // 2. Create a claimed request (claimed by volunteerUser, requested by requesterUser)
    const claimedReq = await RequestModel.create({
      category: 'medical',
      description: 'Senior citizen needs insulin delivery',
      status: 'in_progress',
      location: {
        publicLat: 30.905,
        publicLng: 75.855,
        preciseLat: 30.906,
        preciseLng: 75.856,
      },
      contactPhone: '+91 98765 43210',
      createdBy: requesterUser._id,
      claimedBy: volunteerUser._id,
    });

    // 3. Connect 3 sessions: Claimant, Requester, and Unauthorized Volunteer
    const claimantClient: ClientSocket = Client(`http://localhost:${port}`, {
      auth: { token: volunteerToken },
      transports: ['websocket'],
    });
    const requesterClient: ClientSocket = Client(`http://localhost:${port}`, {
      auth: { token: requesterToken },
      transports: ['websocket'],
    });
    const unauthorizedClient: ClientSocket = Client(`http://localhost:${port}`, {
      auth: { token: unauthorizedToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => claimantClient.on('connect', () => resolve())),
      new Promise<void>((resolve) => requesterClient.on('connect', () => resolve())),
      new Promise<void>((resolve) => unauthorizedClient.on('connect', () => resolve())),
    ]);

    // 4. Authorized participants join room
    const claimantSub = await new Promise<any>((resolve) => {
      claimantClient.emit('subscribe:request', claimedReq.requestId, (res: any) => resolve(res));
    });
    expect(claimantSub.status).toBe('ok');

    const requesterSub = await new Promise<any>((resolve) => {
      requesterClient.emit('subscribe:request', claimedReq.requestId, (res: any) => resolve(res));
    });
    expect(requesterSub.status).toBe('ok');

    // 5. Unauthorized volunteer attempts to join room: MUST BE REJECTED
    const denialPromise = new Promise<any>((resolve) => {
      unauthorizedClient.on('error:permission_denied', (data) => resolve(data));
    });

    const unauthorizedSub = await new Promise<any>((resolve) => {
      unauthorizedClient.emit('subscribe:request', claimedReq.requestId, (res: any) => resolve(res));
    });
    expect(unauthorizedSub.status).toBe('error');
    expect(unauthorizedSub.error).toContain('Access denied');

    const denialEvent = await denialPromise;
    expect(denialEvent.error).toContain('Access denied');

    // 6. Set up listeners for message:new
    const claimantMsgPromise = new Promise<any>((resolve) => {
      claimantClient.on('message:new', (data) => resolve(data));
    });
    const requesterMsgPromise = new Promise<any>((resolve) => {
      requesterClient.on('message:new', (data) => resolve(data));
    });

    let unauthorizedReceivedMessage = false;
    unauthorizedClient.on('message:new', () => {
      unauthorizedReceivedMessage = true;
    });

    // 7. Claimant posts a message to the thread
    const postRes = await request(app)
      .post(`/api/requests/${claimedReq.requestId}/messages`)
      .set('Authorization', `Bearer ${volunteerToken}`)
      .send({
        body: 'Medical responder has arrived with the insulin supplies.',
      });

    expect(postRes.status).toBe(201);

    // 8. Verify both authorized sessions receive message:new live
    const claimantMsg = await claimantMsgPromise;
    expect(claimantMsg.message).toBeDefined();
    expect(claimantMsg.message.body).toBe('Medical responder has arrived with the insulin supplies.');
    expect(claimantMsg.message.senderRole).toBe('claimant');
    expect(claimantMsg.message.senderName).toBe(volunteerUser.name);

    const requesterMsg = await requesterMsgPromise;
    expect(requesterMsg.message).toBeDefined();
    expect(requesterMsg.message.body).toBe('Medical responder has arrived with the insulin supplies.');
    expect(requesterMsg.message.senderRole).toBe('claimant');

    // 9. Verify unauthorized session DID NOT receive the event at all
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(unauthorizedReceivedMessage).toBe(false);

    claimantClient.disconnect();
    requesterClient.disconnect();
    unauthorizedClient.disconnect();
  });
});
