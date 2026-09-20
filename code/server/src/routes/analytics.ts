import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getAnalyticsSummary } from '../services/analytics';

const router = Router();

/**
 * GET /api/analytics
 * Surfaces the four proposal metrics for the admin console:
 * 1. Time-to-Match
 * 2. Double-Booking Rate (query-backed integrity verification)
 * 3. Confirmation Rate
 * 4. Propagation Latency
 */
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawRange = req.query.timeRange as string | undefined;
      const validRanges = ['24h', '7d', '30d', 'all'];
      const timeRange = validRanges.includes(rawRange || '')
        ? (rawRange as '24h' | '7d' | '30d' | 'all')
        : '7d';

      const data = await getAnalyticsSummary(timeRange);

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('[Analytics Error]', error);
      res.status(500).json({ error: 'Failed to calculate platform analytics summary.' });
    }
  }
);

export default router;
