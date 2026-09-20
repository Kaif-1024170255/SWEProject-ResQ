import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import app from '../src/app';
import {
  User,
  Request as RequestModel,
  Evidence,
} from '../src/models';

let mongoServer: MongoMemoryServer;
const TEST_JWT_SECRET = 'test-secret-for-evidence-tests';

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
  await Evidence.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();

  // Clean up any test uploads in uploads/evidence
  const testUploadDir = path.join(process.cwd(), 'uploads', 'evidence');
  if (fs.existsSync(testUploadDir)) {
    const files = fs.readdirSync(testUploadDir);
    for (const file of files) {
      if (file.includes('test-evidence-file')) {
        fs.unlinkSync(path.join(testUploadDir, file));
      }
    }
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  await Evidence.deleteMany({});
});

describe('Evidence Attachment Metadata & Linking', () => {
  it('should correctly upload evidence and link metadata to request and uploader', async () => {
    // 1. Create a user (volunteer responder)
    const volunteer = await User.create({
      name: 'Rohan Responder',
      email: 'rohan@example.org',
      passwordHash: 'dummyhash',
      role: 'volunteer',
    });
    const token = createAuthToken(volunteer._id.toString(), volunteer.role, volunteer.name);

    // 2. Create an emergency request
    const reqDoc = await RequestModel.create({
      requestId: 'REQ-EVIDENCE-01',
      category: 'rescue',
      description: 'Flooding in basement with stranded residents',
      location: { preciseLat: 12.9716, preciseLng: 77.5946, publicLat: 12.9716, publicLng: 77.5946 },
      status: 'in_progress',
    });

    // 3. Upload evidence attachment
    const dummyBuffer = Buffer.from('FAKE_IMAGE_BYTES_FOR_TESTING');
    const uploadRes = await request(app)
      .post(`/api/requests/${reqDoc.requestId}/evidence`)
      .set('Authorization', `Bearer ${token}`)
      .field('description', 'Photo of front doorway water depth')
      .attach('file', dummyBuffer, 'flood_depth_measurement.jpg');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.success).toBe(true);
    expect(uploadRes.body.evidence).toBeDefined();

    const evidenceData = uploadRes.body.evidence;
    expect(evidenceData.fileName).toBe('flood_depth_measurement.jpg');
    expect(evidenceData.fileType).toBe('image/jpeg');
    expect(evidenceData.fileUrl).toContain('/uploads/evidence/');
    expect(evidenceData.fileSize).toBe(dummyBuffer.length);
    expect(evidenceData.description).toBe('Photo of front doorway water depth');
    expect(evidenceData.uploader).toBe(volunteer._id.toString());
    expect(evidenceData.uploaderName).toBe('Rohan Responder');

    // 4. Verify in database
    const savedInDb = await Evidence.findById(evidenceData._id);
    expect(savedInDb).not.toBeNull();
    expect(savedInDb!.request.toString()).toBe(reqDoc._id.toString());
    expect(savedInDb!.uploader!.toString()).toBe(volunteer._id.toString());

    // 5. Fetch evidence list for the request
    const listRes = await request(app)
      .get(`/api/requests/${reqDoc.requestId}/evidence`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(1);
    expect(listRes.body.evidence[0].fileName).toBe('flood_depth_measurement.jpg');
    expect(listRes.body.evidence[0].uploader.name).toBe('Rohan Responder');
  });

  it('should allow anonymous informants to upload supporting evidence with fallback uploader name', async () => {
    const reqDoc = await RequestModel.create({
      requestId: 'REQ-EVIDENCE-ANON',
      category: 'medical',
      description: 'Road blocked by debris',
      location: { preciseLat: 13.0827, preciseLng: 80.2707, publicLat: 13.0827, publicLng: 80.2707 },
      status: 'unverified',
    });

    const dummyPdf = Buffer.from('%PDF-1.4 test document content');
    const uploadRes = await request(app)
      .post(`/api/requests/${reqDoc.requestId}/evidence`)
      .field('uploaderName', 'Concerned Citizen')
      .attach('file', dummyPdf, 'site_report.pdf');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.evidence.fileName).toBe('site_report.pdf');
    expect(uploadRes.body.evidence.fileType).toBe('application/pdf');
    expect(uploadRes.body.evidence.uploaderName).toBe('Concerned Citizen');
    expect(uploadRes.body.evidence.uploader).toBeUndefined();

    // Verify retrieval
    const listRes = await request(app)
      .get(`/api/requests/${reqDoc.requestId}/evidence`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(1);
    expect(listRes.body.evidence[0].uploaderName).toBe('Concerned Citizen');
  });

  it('should reject upload if no file is provided', async () => {
    const reqDoc = await RequestModel.create({
      requestId: 'REQ-NO-FILE',
      category: 'shelter',
      description: 'Roof leak',
      location: { preciseLat: 15.0, preciseLng: 75.0, publicLat: 15.0, publicLng: 75.0 },
      status: 'verified',
    });

    const res = await request(app)
      .post(`/api/requests/${reqDoc.requestId}/evidence`)
      .send({ description: 'No file attached' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No file uploaded');
  });
});
