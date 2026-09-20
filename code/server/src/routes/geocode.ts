import { Router, Request, Response } from 'express';

const router = Router();

interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  type?: string;
  importance?: number;
}

interface CacheEntry {
  timestamp: number;
  results: GeocodeResult[];
}

// In-memory cache with 15-minute TTL
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

// Upstream Nominatim rate limiting: maximum 1 request per second
let lastNominatimRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1050; // 1.05s buffer to strictly adhere to >= 1s policy

// Simple FIFO promise queue to serialize upstream Nominatim requests
let requestQueue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Throttle upstream calls to guarantee at least 1 second between requests
 */
async function scheduleNominatimRequest<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now();
    const elapsed = now - lastNominatimRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastNominatimRequestTime = Date.now();
    return fn();
  };

  const nextPromise = requestQueue.then(run, run);
  requestQueue = nextPromise.then(() => {}, () => {});
  return nextPromise;
}

/**
 * GET /api/geocode?q=<text>
 * Proxies geocoding requests to OpenStreetMap Nominatim with caching and rate limiting.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q;

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({
        error: 'Query parameter "q" is required and cannot be empty.',
        results: [],
      });
      return;
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Check cache first
    const cached = cache.get(normalizedQuery);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      res.status(200).json({
        query: query.trim(),
        cached: true,
        results: cached.results,
      });
      return;
    }

    // Call upstream OpenStreetMap Nominatim API via serialized throttler
    const results = await scheduleNominatimRequest(async () => {
      // Re-check cache inside throttler in case a concurrent request already resolved it
      const secondCheck = cache.get(normalizedQuery);
      if (secondCheck && Date.now() - secondCheck.timestamp < CACHE_TTL_MS) {
        return secondCheck.results;
      }

      const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
      nominatimUrl.searchParams.set('format', 'json');
      nominatimUrl.searchParams.set('q', query.trim());
      nominatimUrl.searchParams.set('limit', '5');
      nominatimUrl.searchParams.set('addressdetails', '1');

      const response = await fetch(nominatimUrl.toString(), {
        headers: {
          'User-Agent': 'ResQ-Crisis-Coordination-Platform/1.0 (College-Capstone; contact: dispatch@resq.org)',
          'Referer': 'https://resq-crisis-platform.local',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Geocoding rate limit reached. Please try again in a few moments.');
        }
        throw new Error(`Nominatim geocoding error: ${response.statusText}`);
      }

      const data = (await response.json()) as any[];

      const rawItems = Array.isArray(data) ? data : [];
      const parsed: GeocodeResult[] = [];

      for (const item of rawItems) {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          parsed.push({
            displayName: item.display_name || 'Unknown Location',
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            type: item.type || item.class || 'location',
            importance: typeof item.importance === 'number' ? item.importance : undefined,
          });
        }
      }

      // Save to cache
      cache.set(normalizedQuery, {
        timestamp: Date.now(),
        results: parsed,
      });

      // Cleanup cache if size exceeds 200 entries
      if (cache.size > 200) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }

      return parsed;
    });

    res.status(200).json({
      query: query.trim(),
      cached: false,
      results,
    });
  } catch (error) {
    console.error('Geocoding proxy error:', error);
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to retrieve geocoding results.',
      results: [],
    });
  }
});

export default router;
export { cache as geocodeCache };
