import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  initSocketIO,
  broadcastToPublic,
  broadcastToRequest,
} from '../src/socket';

describe('Socket.IO Real-Time Engine & Handshake Authentication', () => {
  let server: http.Server;
  let port: number;
  const TEST_SECRET = 'socket-test-secret-key-2026';
  let validToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    // Create an ephemeral HTTP server
    server = http.createServer(app);
    initSocketIO(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        port = address.port;
        resolve();
      });
    });

    // Create valid JWT for an authenticated volunteer
    validToken = jwt.sign(
      {
        id: '507f191e810c19729de860ea',
        name: 'Test Volunteer',
        email: 'volunteer@test.org',
        role: 'volunteer',
      },
      TEST_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('allows an authenticated user to connect with valid JWT and joins public room', async () => {
    const client: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    const receivedPromise = new Promise<{ message: string }>((resolve) => {
      client.on('test:public_event', (data) => {
        resolve(data);
      });
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
    });

    expect(client.connected).toBe(true);

    // Broadcast to the public channel
    broadcastToPublic('test:public_event', { message: 'hello public' });

    const received = await receivedPromise;
    expect(received.message).toBe('hello public');

    client.disconnect();
  });

  it('allows an anonymous bystander to connect without token and joins public room', async () => {
    const anonymousClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      // No token in auth
    });

    const publicEventPromise = new Promise<{ message: string }>((resolve) => {
      anonymousClient.on('test:public_announcement', (data) => {
        resolve(data);
      });
    });

    await new Promise<void>((resolve, reject) => {
      anonymousClient.on('connect', () => resolve());
      anonymousClient.on('connect_error', (err) => reject(err));
    });

    expect(anonymousClient.connected).toBe(true);

    // Verify anonymous client receives public broadcasts
    broadcastToPublic('test:public_announcement', { message: 'storm warning' });
    const received = await publicEventPromise;
    expect(received.message).toBe('storm warning');

    anonymousClient.disconnect();
  });

  it('rejects connection when an invalid or corrupt JWT is provided in handshake', async () => {
    const invalidClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: 'invalid.corrupted.jwt.token' },
      reconnection: false, // Prevent infinite retry
    });

    const errorPromise = new Promise<Error>((resolve) => {
      invalidClient.on('connect_error', (err) => {
        resolve(err);
      });
    });

    const error = await errorPromise;
    expect(error.message).toContain('Authentication error: Invalid or expired token');
    expect(invalidClient.connected).toBe(false);

    invalidClient.disconnect();
  });

  it('allows authenticated clients to subscribe to per-request channels and receive scoped updates', async () => {
    const authClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: validToken },
    });

    await new Promise<void>((resolve) => {
      authClient.on('connect', () => resolve());
    });

    // Subscribe to request REQ-2026-004801
    const subResponse = await new Promise<{ status: string }>((resolve) => {
      authClient.emit('subscribe:request', 'REQ-2026-004801', (res: { status: string }) => {
        resolve(res);
      });
    });

    expect(subResponse.status).toBe('ok');

    // Test receiving scoped event in this request room
    const requestEventPromise = new Promise<{ action: string }>((resolve) => {
      authClient.on('request:status_changed', (data) => {
        resolve(data);
      });
    });

    broadcastToRequest('REQ-2026-004801', 'request:status_changed', { action: 'claimed' });
    const received = await requestEventPromise;
    expect(received.action).toBe('claimed');

    // Unsubscribe
    const unsubResponse = await new Promise<{ status: string }>((resolve) => {
      authClient.emit('unsubscribe:request', 'REQ-2026-004801', (res: { status: string }) => {
        resolve(res);
      });
    });
    expect(unsubResponse.status).toBe('ok');

    authClient.disconnect();
  });

  it('denies anonymous clients from joining request-specific channels', async () => {
    const anonymousClient: ClientSocket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      anonymousClient.on('connect', () => resolve());
    });

    // Attempt to join a per-request room as an anonymous client
    const denialPromise = new Promise<{ error: string }>((resolve) => {
      anonymousClient.on('error:permission_denied', (data) => {
        resolve(data);
      });
    });

    const subResponse = await new Promise<{ status: string; error?: string }>((resolve) => {
      anonymousClient.emit('subscribe:request', 'REQ-2026-004801', (res: { status: string; error?: string }) => {
        resolve(res);
      });
    });

    expect(subResponse.status).toBe('error');
    expect(subResponse.error).toContain('Anonymous clients cannot join');

    const denialEvent = await denialPromise;
    expect(denialEvent.error).toContain('Anonymous clients cannot join');

    anonymousClient.disconnect();
  });
});
