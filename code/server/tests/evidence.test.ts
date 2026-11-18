import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  Evidence,
} from '../src/models';
import { findGridFSFile, validateFileMagicBytes } from '../src/services/gridfs';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-evidence-tests';

function createAuthToken(userId: string, role: string, name?: string): string {
  return jwt.sign({ userId, role, name }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

function createValidJpegBuffer(payload = 'VALID_JPEG_BYTES'): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from(payload)]);
}

function createValidPngBuffer(payload = 'VALID_PNG_BYTES'): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(payload)]);
}

function createValidWebpBuffer(payload = 'VALID_WEBP_BYTES'): Buffer {
  const header = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // 'RIFF'
    0x00, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50, // 'WEBP'
  ]);
  return Buffer.concat([header, Buffer.from(payload)]);
}

function createValidPdfBuffer(payload = 'test site inspection document bytes'): Buffer {
  return Buffer.from(`%PDF-1.4\n${payload}`);
}

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await RequestModel.syncIndexes();
  await Evidence.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Evidence.deleteMany({});
  if (mongoose.connection.db) {
    try {
      await mongoose.connection.db.collection('evidence.files').deleteMany({});
      await mongoose.connection.db.collection('evidence.chunks').deleteMany({});
    } catch (_err) {
      // Collections might not be initialized on initial run
    }
  }
});

describe('Phase 6 Prompt 1B — Final GridFS Security & Reliability Review', () => {
  async function setupTestContext() {
    const volunteer = await User.create({
      name: 'Rohan Responder',
      email: 'rohan@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const volunteerToken = createAuthToken(volunteer._id.toString(), volunteer.role, volunteer.name);

    const secondVolunteer = await User.create({
      name: 'Vikram Volunteer',
      email: 'vikram@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const secondVolunteerToken = createAuthToken(secondVolunteer._id.toString(), secondVolunteer.role, secondVolunteer.name);

    const citizenRequester = await User.create({
      name: 'Sunita Sharma',
      email: 'sunita@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const requesterToken = createAuthToken(citizenRequester._id.toString(), citizenRequester.role, citizenRequester.name);

    const admin = await User.create({
      name: 'Central Admin',
      email: 'admin@resq.local',
      passwordHash: 'dummyhash',
      role: 'admin',
    });
    const adminToken = createAuthToken(admin._id.toString(), admin.role, admin.name);

    const unrelatedCitizen = await User.create({
      name: 'Unrelated User',
      email: 'unrelated@example.org',
      passwordHash: 'dummyhash',
      role: 'affected_person',
    });
    const unrelatedToken = createAuthToken(unrelatedCitizen._id.toString(), unrelatedCitizen.role, unrelatedCitizen.name);

    const reqDoc = await RequestModel.create({
      requestId: 'REQ-EVIDENCE-01',
      category: 'rescue',
      description: 'Basement flooding with stranded family',
      location: { preciseLat: 12.9716, preciseLng: 77.5946, publicLat: 12.9716, publicLng: 77.5946 },
      status: 'in_progress',
      createdBy: citizenRequester._id,
      claimedBy: volunteer._id,
    });

    return {
      volunteer,
      volunteerToken,
      secondVolunteer,
      secondVolunteerToken,
      citizenRequester,
      requesterToken,
      admin,
      adminToken,
      unrelatedCitizen,
      unrelatedToken,
      reqDoc,
    };
  }

  // 1. File-content validation (Magic bytes)
  describe('1. File-content validation (Magic bytes)', () => {
    it('correctly identifies valid signatures via validateFileMagicBytes', () => {
      expect(validateFileMagicBytes(createValidJpegBuffer()).detectedMime).toBe('image/jpeg');
      expect(validateFileMagicBytes(createValidPngBuffer()).detectedMime).toBe('image/png');
      expect(validateFileMagicBytes(createValidWebpBuffer()).detectedMime).toBe('image/webp');
      expect(validateFileMagicBytes(createValidPdfBuffer()).detectedMime).toBe('application/pdf');

      expect(validateFileMagicBytes(Buffer.from('PLAIN TEXT NOT AN IMAGE')).isValid).toBe(false);
      expect(validateFileMagicBytes(Buffer.from([0x00, 0x01])).isValid).toBe(false);
    });

    it('rejects files with fake extensions whose magic bytes do not match', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();

      // Executable disguised as .jpg
      const fakeJpg = Buffer.from('MZ_WINDOWS_EXECUTABLE_HEADER_FAKE_DATA');
      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', fakeJpg, 'malicious_photo.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('File content signature verification failed');
    });

    it('rejects mismatched files (e.g. PDF bytes with image/jpeg Content-Type)', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();

      const pdfBytesDisguisedAsJpg = createValidPdfBuffer();
      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', pdfBytesDisguisedAsJpg, { filename: 'photo.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Mismatched file format');
    });

    it('successfully uploads genuine WebP images', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();
      const webpBuffer = createValidWebpBuffer();

      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', webpBuffer, 'aerial_survey.webp');

      expect(res.status).toBe(201);
      expect(res.body.evidence.fileType).toBe('image/webp');
    });
  });

  // 2. Comprehensive Operation & Role Authorization Testing
  describe('2. Independent Operation & Role Authorization Testing', () => {
    it('Upload: allows admin, responder, requester; rejects unrelated citizen and anonymous', async () => {
      const { adminToken, volunteerToken, requesterToken, unrelatedToken, reqDoc } = await setupTestContext();
      const jpeg = createValidJpegBuffer();

      // Admin upload -> 201
      const resAdmin = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', jpeg, 'admin_survey.jpg');
      expect(resAdmin.status).toBe(201);

      // Responder upload -> 201
      const resVol = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', jpeg, 'volunteer_survey.jpg');
      expect(resVol.status).toBe(201);

      // Requester upload -> 201
      const resReq = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .attach('file', jpeg, 'requester_proof.jpg');
      expect(resReq.status).toBe(201);

      // Unrelated citizen -> 403
      const resUnrelated = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .attach('file', jpeg, 'intruder.jpg');
      expect(resUnrelated.status).toBe(403);
      expect(resUnrelated.body.error).toContain('Access denied');

      // Anonymous -> 401
      const resAnon = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .attach('file', jpeg, 'anonymous.jpg');
      expect(resAnon.status).toBe(401);
      expect(resAnon.body.error).toContain('Authentication required');
    });

    it('Preview & Download: allows authorized roles and prevents unauthorized access', async () => {
      const { volunteerToken, requesterToken, adminToken, unrelatedToken, reqDoc } = await setupTestContext();
      const png = createValidPngBuffer('DOWNLOAD_TEST_BYTES');

      const uploadRes = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', png, 'test_evidence.png');

      const evId = uploadRes.body.evidence._id;

      // Admin download -> 200
      const dlAdmin = await request(app).get(`/api/evidence/${evId}/file`).set('Authorization', `Bearer ${adminToken}`);
      expect(dlAdmin.status).toBe(200);
      expect(dlAdmin.body.toString('utf8')).toBe(png.toString('utf8'));

      // Requester download -> 200
      const dlReq = await request(app).get(`/api/evidence/${evId}/file`).set('Authorization', `Bearer ${requesterToken}`);
      expect(dlReq.status).toBe(200);

      // Uploader download -> 200
      const dlVol = await request(app).get(`/api/evidence/${evId}/file`).set('Authorization', `Bearer ${volunteerToken}`);
      expect(dlVol.status).toBe(200);

      // Unrelated citizen -> 403
      const dlUnrelated = await request(app).get(`/api/evidence/${evId}/file`).set('Authorization', `Bearer ${unrelatedToken}`);
      expect(dlUnrelated.status).toBe(403);

      // Unauthenticated -> 401
      const dlAnon = await request(app).get(`/api/evidence/${evId}/file`);
      expect(dlAnon.status).toBe(401);
    });

    it('Deletion: verifies consistent authorization on BOTH deletion endpoints', async () => {
      const { volunteerToken, secondVolunteerToken, adminToken, unrelatedToken, reqDoc } = await setupTestContext();
      const jpeg = createValidJpegBuffer();

      // --- ENDPOINT A: DELETE /api/requests/:id/evidence/:evidenceId ---
      const upA = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', jpeg, 'delete_test_a.jpg');
      const evIdA = upA.body.evidence._id;
      const gridIdA = upA.body.evidence.gridFsFileId;

      // 1. Unauthenticated -> 401
      const delA1 = await request(app).delete(`/api/requests/${reqDoc.requestId}/evidence/${evIdA}`);
      expect(delA1.status).toBe(401);

      // 2. Unrelated citizen -> 403
      const delA2 = await request(app)
        .delete(`/api/requests/${reqDoc.requestId}/evidence/${evIdA}`)
        .set('Authorization', `Bearer ${unrelatedToken}`);
      expect(delA2.status).toBe(403);

      // 3. Different responder who is not uploader -> 403
      const delA3 = await request(app)
        .delete(`/api/requests/${reqDoc.requestId}/evidence/${evIdA}`)
        .set('Authorization', `Bearer ${secondVolunteerToken}`);
      expect(delA3.status).toBe(403);

      // 4. Uploader deletion -> 200
      const delA4 = await request(app)
        .delete(`/api/requests/${reqDoc.requestId}/evidence/${evIdA}`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      expect(delA4.status).toBe(200);
      expect(await Evidence.findById(evIdA)).toBeNull();
      expect(await findGridFSFile(gridIdA)).toBeNull();

      // --- ENDPOINT B: DELETE /api/evidence/:id ---
      const upB = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', jpeg, 'delete_test_b.jpg');
      const evIdB = upB.body.evidence._id;
      const gridIdB = upB.body.evidence.gridFsFileId;

      // 1. Unauthenticated -> 401
      const delB1 = await request(app).delete(`/api/evidence/${evIdB}`);
      expect(delB1.status).toBe(401);

      // 2. Unrelated citizen -> 403
      const delB2 = await request(app).delete(`/api/evidence/${evIdB}`).set('Authorization', `Bearer ${unrelatedToken}`);
      expect(delB2.status).toBe(403);

      // 3. Different responder -> 403
      const delB3 = await request(app).delete(`/api/evidence/${evIdB}`).set('Authorization', `Bearer ${secondVolunteerToken}`);
      expect(delB3.status).toBe(403);

      // 4. Admin deletion -> 200
      const delB4 = await request(app).delete(`/api/evidence/${evIdB}`).set('Authorization', `Bearer ${adminToken}`);
      expect(delB4.status).toBe(200);
      expect(await Evidence.findById(evIdB)).toBeNull();
      expect(await findGridFSFile(gridIdB)).toBeNull();
    });
  });

  // 3. Upload reliability, memory & size enforcement
  describe('3. Upload reliability & Size Limits', () => {
    it('enforces 5 MB limit during multipart parsing and rejects oversized files', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 2048, 0xff); // > 5 MB

      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', oversized, 'huge_file.jpg');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('5 MB limit');
    });

    it('handles missing file attachments cleanly with 400 Bad Request', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();

      const res = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .send({ description: 'No file included' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No file uploaded');
    });
  });

  // 4. GridFS integrity & Simulated Backend Restart
  describe('4. GridFS Integrity & Restart Persistence', () => {
    it('ensures persistent retrieval across simulated backend disconnection and restart', async () => {
      const { volunteerToken, reqDoc } = await setupTestContext();
      const originalPdf = createValidPdfBuffer('RESTART_PERSISTENCE_TEST_DOCUMENT');

      const up = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', originalPdf, 'restart_doc.pdf');

      const evId = up.body.evidence._id;

      // Simulate backend restart by closing mongoose connection and reconnecting
      await mongoose.disconnect();
      expect(mongoose.connection.readyState).toBe(0);

      await mongoose.connect(mongoServer.getUri());
      expect(mongoose.connection.readyState).toBe(1);

      // Fetch file after restart
      const fetchRes = await request(app)
        .get(`/api/evidence/${evId}/file`)
        .set('Authorization', `Bearer ${volunteerToken}`);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.toString('utf8')).toBe(originalPdf.toString('utf8'));
    });

    it('protects legacy /uploads/evidence/:filename routes with authorization check', async () => {
      const { volunteerToken, unrelatedToken, reqDoc } = await setupTestContext();
      const jpeg = createValidJpegBuffer('LEGACY_ACCESS_CHECK');

      const up = await request(app)
        .post(`/api/requests/${reqDoc.requestId}/evidence`)
        .set('Authorization', `Bearer ${volunteerToken}`)
        .attach('file', jpeg, 'legacy_survey.jpg');

      const storageKey = up.body.evidence.storageKey;

      // Unrelated citizen access via legacy route -> 403
      const resForbidden = await request(app)
        .get(`/uploads/evidence/${storageKey}`)
        .set('Authorization', `Bearer ${unrelatedToken}`);
      expect(resForbidden.status).toBe(403);

      // Authorized volunteer access via legacy route -> 200
      const resOk = await request(app)
        .get(`/uploads/evidence/${storageKey}`)
        .set('Authorization', `Bearer ${volunteerToken}`);
      expect(resOk.status).toBe(200);
      expect(resOk.body.toString('utf8')).toBe(jpeg.toString('utf8'));
    });
  });
});
