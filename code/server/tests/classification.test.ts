import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import {
  classifyHeuristic,
  classifyEmergencyDescription,
} from '../src/services/classification';
import { Request as RequestModel, User } from '../src/models';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await User.syncIndexes();
  await RequestModel.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await RequestModel.deleteMany({});
  process.env.ENABLE_AI_CLASSIFICATION = 'true';
});

describe('Phase 4: AI & Heuristic Classification Service', () => {
  it('should accurately classify medical emergencies with high/critical urgency using heuristic rules', () => {
    const res1 = classifyHeuristic('Diabetic resident trapped without insulin, experiencing severe fever and chest pain');
    expect(res1.suggestedCategory).toBe('medical');
    expect(['high', 'critical']).toContain(res1.urgency);
    expect(res1.provider).toBe('heuristic');
  });

  it('should accurately classify flood rescue emergencies with critical urgency', () => {
    const res2 = classifyHeuristic('Family stranded on rooftop surrounded by rising water, boat rescue needed immediately');
    expect(res2.suggestedCategory).toBe('rescue');
    expect(res2.urgency).toBe('critical');
    expect(res2.rationale).toContain('rising floodwaters');
  });

  it('should accurately classify shelter displacement requirements', () => {
    const res3 = classifyHeuristic('House roof destroyed by storm, displaced family needs tarpaulins and dry blankets');
    expect(res3.suggestedCategory).toBe('shelter');
  });

  it('should accurately classify clean water and food supply requirements', () => {
    const res4 = classifyHeuristic('Urgent need for drinking water and rations for 50 people');
    expect(res4.suggestedCategory).toBe('supplies');
  });

  it('POST /api/classification/suggest: should return 200 with suggestion for valid emergency text', async () => {
    const res = await request(app)
      .post('/api/classification/suggest')
      .send({ text: 'Severe laceration and bleeding from broken glass in flood water' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.enabled).toBe(true);
    expect(res.body.suggestion).toBeDefined();
    expect(res.body.suggestion.suggestedCategory).toBe('medical');
    expect(res.body.suggestion).toHaveProperty('urgency');
    expect(res.body.suggestion).toHaveProperty('rationale');
  });

  it('POST /api/classification/suggest: should return suggestion: null for empty or too short text', async () => {
    const res = await request(app)
      .post('/api/classification/suggest')
      .send({ text: 'hi' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestion).toBeNull();
  });

  it('POST /api/classification/suggest: should gracefully disable when ENABLE_AI_CLASSIFICATION=false', async () => {
    process.env.ENABLE_AI_CLASSIFICATION = 'false';

    const res = await request(app)
      .post('/api/classification/suggest')
      .send({ text: 'Critical rescue needed on rooftop' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.enabled).toBe(false);
    expect(res.body.suggestion).toBeNull();
  });

  it('Decoupled guarantee: Request submission succeeds completely whether classification service is enabled or disabled', async () => {
    // 1. With classification disabled
    process.env.ENABLE_AI_CLASSIFICATION = 'false';

    const resDisabled = await request(app)
      .post('/api/requests')
      .send({
        category: 'medical',
        description: 'Submission test while AI service is simulated as disabled',
        preciseLat: 30.901,
        preciseLng: 75.855,
      });

    expect(resDisabled.status).toBe(201);
    expect(resDisabled.body.request.requestId).toBeDefined();

    // 2. With classification enabled
    process.env.ENABLE_AI_CLASSIFICATION = 'true';

    const resEnabled = await request(app)
      .post('/api/requests')
      .send({
        category: 'rescue',
        description: 'Submission test while AI service is enabled',
        preciseLat: 30.902,
        preciseLng: 75.856,
      });

    expect(resEnabled.status).toBe(201);
    expect(resEnabled.body.request.requestId).toBeDefined();
  });
});
