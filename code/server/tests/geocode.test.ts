import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import { geocodeCache } from '../src/routes/geocode';

describe('GET /api/geocode (OSM Nominatim Proxy)', () => {
  beforeEach(() => {
    geocodeCache.clear();
  });

  it('should return 400 when query parameter "q" is missing or empty', async () => {
    const res = await request(app).get('/api/geocode');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Query parameter "q" is required/i);
    expect(res.body.results).toEqual([]);
  });

  it('should return 400 when query parameter "q" is only whitespace', async () => {
    const res = await request(app).get('/api/geocode?q=   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be empty/i);
  });

  it('should return 200 with matching candidates for a real query and cache subsequent queries', async () => {
    // First query hits upstream or mocked fetch
    const res1 = await request(app).get('/api/geocode?q=Ludhiana');
    expect(res1.status).toBe(200);
    expect(res1.body).toHaveProperty('results');
    expect(Array.isArray(res1.body.results)).toBe(true);
    expect(res1.body.cached).toBe(false);

    if (res1.body.results.length > 0) {
      const first = res1.body.results[0];
      expect(first).toHaveProperty('displayName');
      expect(first).toHaveProperty('lat');
      expect(first).toHaveProperty('lng');
      expect(typeof first.lat).toBe('number');
      expect(typeof first.lng).toBe('number');
    }

    // Immediate second query with identical query should return cached: true
    const res2 = await request(app).get('/api/geocode?q=Ludhiana');
    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(true);
    expect(res2.body.results).toEqual(res1.body.results);
  });
});
