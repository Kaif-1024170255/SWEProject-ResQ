import { Router, Request, Response } from 'express';
import { classifyEmergencyDescription } from '../services/classification';

const router = Router();

/**
 * POST /api/classification/suggest
 * Accepts free-text emergency description and returns suggested category & urgency.
 * Completely optional & decoupled: never blocks form submission if disabled or failing.
 */
router.post('/suggest', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.ENABLE_AI_CLASSIFICATION === 'false') {
      res.status(200).json({
        success: true,
        enabled: false,
        suggestion: null,
      });
      return;
    }

    const text = req.body?.text || req.body?.description;
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      res.status(200).json({
        success: true,
        enabled: true,
        suggestion: null,
      });
      return;
    }

    const suggestion = await classifyEmergencyDescription(text);

    res.status(200).json({
      success: true,
      enabled: true,
      suggestion,
    });
  } catch (error) {
    console.warn('[Classification API Warning] Graceful fallback on error:', error);
    res.status(200).json({
      success: true,
      enabled: false,
      suggestion: null,
    });
  }
});

export default router;
