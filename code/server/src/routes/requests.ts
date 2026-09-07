import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import {
  Request as RequestModel,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  RequestCategory,
  RequestStatus,
} from '../models';
import { requireAuth, requireRole } from '../middleware/auth';
import { JwtPayload } from '../types/auth';

const router = Router();

/**
 * Optional authentication middleware:
 * Populates req.user if a valid Bearer token is provided, but allows unauthenticated requests to proceed.
 */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (secret) {
      try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        req.user = decoded;
      } catch (_err) {
        // Ignore invalid token in optional auth
      }
    }
  }
  next();
}

/**
 * Builds MongoDB query by either human-readable requestId (REQ-2026-XXXXXX) or ObjectId.
 */
function getRequestQuery(id: string) {
  if (id.startsWith('REQ-')) {
    return { requestId: id };
  }
  if (mongoose.isValidObjectId(id)) {
    return { _id: id };
  }
  return { requestId: id };
}

/**
 * Sanitizes request object based on authorization.
 * If isAuthorized is false: precise coordinates and contact phone are stripped.
 */
function sanitizeRequest(doc: any, isAuthorized: boolean = false) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (isAuthorized) {
    return obj;
  }
  const sanitized = {
    ...obj,
    location: {
      publicLat: obj.location.publicLat,
      publicLng: obj.location.publicLng,
    },
  };
  delete sanitized.contactPhone;
  delete sanitized.location.preciseLat;
  delete sanitized.location.preciseLng;
  return sanitized;
}

// 1. POST /api/requests - Public emergency request submission
router.post('/', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, description, preciseLat, preciseLng, contactPhone } = req.body;

    // Validation
    if (!category || !description || preciseLat === undefined || preciseLng === undefined) {
      res.status(400).json({
        error: 'Missing required fields: category, description, preciseLat, and preciseLng are required.',
      });
      return;
    }

    if (!REQUEST_CATEGORIES.includes(category as RequestCategory)) {
      res.status(400).json({
        error: `Invalid category '${category}'. Must be one of: ${REQUEST_CATEGORIES.join(', ')}.`,
      });
      return;
    }

    const latNum = Number(preciseLat);
    const lngNum = Number(preciseLng);

    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      res.status(400).json({
        error: 'Invalid coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.',
      });
      return;
    }

    // Create the request document
    const newRequest = new RequestModel({
      category,
      description: description.trim(),
      location: {
        preciseLat: latNum,
        preciseLng: lngNum,
      },
      status: 'unverified',
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      createdBy: req.user ? req.user.userId : undefined,
    });

    await newRequest.save();

    res.status(201).json({
      message: `Your request has been logged as ${newRequest.requestId}. A volunteer or NGO will be able to see it once it's verified.`,
      requestId: newRequest.requestId,
      request: sanitizeRequest(newRequest, false),
    });
  } catch (error) {
    console.error('Request creation error:', error);
    res.status(500).json({ error: 'Failed to log emergency request.' });
  }
});

// 2. GET /api/requests - Public list with status/category filters (always fuzzed coordinates)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = {};

    if (req.query.status && typeof req.query.status === 'string') {
      if (REQUEST_STATUSES.includes(req.query.status as RequestStatus)) {
        filter.status = req.query.status;
      }
    }

    if (req.query.category && typeof req.query.category === 'string') {
      if (REQUEST_CATEGORIES.includes(req.query.category as RequestCategory)) {
        filter.category = req.query.category;
      }
    }

    // Exclude precise coordinates and contact phone at database projection level
    const requests = await RequestModel.find(filter)
      .select('-location.preciseLat -location.preciseLng -contactPhone')
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role')
      .populate('claimedBy', 'name role');

    res.status(200).json({
      requests,
    });
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ error: 'Failed to retrieve emergency requests.' });
  }
});

// 3. GET /api/requests/:id - Single request details (precise location and contact phone exposed ONLY to admin, claimant, or creator)
router.get('/:id', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const request = await RequestModel.findOne(getRequestQuery(id))
      .populate('createdBy', 'name role')
      .populate('claimedBy', 'name role');

    if (!request) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    // Privacy rule check:
    // Administrators, claimant responder, or original creator may view precise coordinates & contact
    const viewer = req.user;
    const isClaimant =
      viewer &&
      request.claimedBy &&
      (request.claimedBy as any)._id?.toString() === viewer.userId;
    const isAdmin = viewer && viewer.role === 'admin';
    const isCreator =
      viewer &&
      request.createdBy &&
      (request.createdBy as any)._id?.toString() === viewer.userId;

    if (isAdmin || isClaimant || isCreator) {
      res.status(200).json({
        request: sanitizeRequest(request, true),
        isPreciseLocationRevealed: true,
      });
      return;
    }

    // Public / unprivileged view: sanitize coordinates & hide phone
    res.status(200).json({
      request: sanitizeRequest(request, false),
      isPreciseLocationRevealed: false,
    });
  } catch (error) {
    console.error('Fetch single request error:', error);
    res.status(500).json({ error: 'Failed to retrieve request details.' });
  }
});

// 4. PATCH /api/requests/:id/verify - Admin only, unverified -> verified
router.patch(
  '/:id/verify',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const request = await RequestModel.findOne(getRequestQuery(id));

      if (!request) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      if (request.status !== 'unverified') {
        res.status(400).json({
          error: `Cannot verify request: current status is '${request.status}', expected 'unverified'. Lifecycle order cannot be skipped or reversed.`,
        });
        return;
      }

      request.status = 'verified';
      request.statusHistory.push({
        status: 'verified',
        changedAt: new Date(),
        changedBy: new mongoose.Types.ObjectId(req.user!.userId),
        note: req.body.note || 'Request verified by administrator',
      });

      await request.save();

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      res.status(200).json({
        message: `Request ${request.requestId} has been verified and is ready to be claimed.`,
        request: sanitizeRequest(request, true),
      });
    } catch (error) {
      console.error('Verify request error:', error);
      res.status(500).json({ error: 'Failed to verify request.' });
    }
  }
);

// 5. PATCH /api/requests/:id/claim - Volunteer, NGO, or Resource Provider; verified -> in_progress
router.patch(
  '/:id/claim',
  requireAuth,
  requireRole('volunteer', 'ngo', 'resource_provider'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const request = await RequestModel.findOne(getRequestQuery(id));

      if (!request) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      if (request.status !== 'verified') {
        res.status(400).json({
          error: `Cannot claim request: current status is '${request.status}', expected 'verified'. Lifecycle order cannot be skipped or reversed.`,
        });
        return;
      }

      request.status = 'in_progress';
      request.claimedBy = new mongoose.Types.ObjectId(req.user!.userId);
      request.statusHistory.push({
        status: 'in_progress',
        changedAt: new Date(),
        changedBy: new mongoose.Types.ObjectId(req.user!.userId),
        note: req.body.note || 'Claimed by responder',
      });

      await request.save();

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      res.status(200).json({
        message: `Request ${request.requestId} claimed successfully. Precise location and contact details are now accessible.`,
        request: sanitizeRequest(request, true),
      });
    } catch (error) {
      console.error('Claim request error:', error);
      res.status(500).json({ error: 'Failed to claim request.' });
    }
  }
);

// 6. PATCH /api/requests/:id/resolve - Claimant or admin; in_progress -> resolved
router.patch(
  '/:id/resolve',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const request = await RequestModel.findOne(getRequestQuery(id));

      if (!request) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      if (request.status !== 'in_progress') {
        res.status(400).json({
          error: `Cannot resolve request: current status is '${request.status}', expected 'in_progress'. Lifecycle order cannot be skipped or reversed.`,
        });
        return;
      }

      const isClaimant =
        request.claimedBy && request.claimedBy.toString() === req.user!.userId;
      const isAdmin = req.user!.role === 'admin';

      if (!isClaimant && !isAdmin) {
        res.status(403).json({
          error: 'Access denied: Only the assigned claimant or an administrator can mark this request as resolved.',
        });
        return;
      }

      request.status = 'resolved';
      request.statusHistory.push({
        status: 'resolved',
        changedAt: new Date(),
        changedBy: new mongoose.Types.ObjectId(req.user!.userId),
        note: req.body.note || 'Marked as resolved by responder/admin',
      });

      await request.save();

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      res.status(200).json({
        message: `Request ${request.requestId} has been marked as resolved. Pending confirmation from requester.`,
        request: sanitizeRequest(request, true),
      });
    } catch (error) {
      console.error('Resolve request error:', error);
      res.status(500).json({ error: 'Failed to resolve request.' });
    }
  }
);

// 7. PATCH /api/requests/:id/confirm - Requester only (or verified anonymous submitter); resolved -> closed
router.patch(
  '/:id/confirm',
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const request = await RequestModel.findOne(getRequestQuery(id));

      if (!request) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      if (request.status !== 'resolved') {
        res.status(400).json({
          error: `Cannot confirm resolution: current status is '${request.status}', expected 'resolved'. A request must be resolved before it can be closed.`,
        });
        return;
      }

      const user = req.user;
      const { contactPhone } = req.body;
      let isAuthorizedRequester = false;

      // 1. If created by an authenticated user, that user can confirm
      if (request.createdBy && user && request.createdBy.toString() === user.userId) {
        isAuthorizedRequester = true;
      }

      // 2. If contactPhone was recorded, match normalized contactPhone
      if (!isAuthorizedRequester && request.contactPhone) {
        const normalize = (p: string) => p.replace(/[\s\-\(\)\+]/g, '');
        if (contactPhone && normalize(String(contactPhone)) === normalize(request.contactPhone)) {
          isAuthorizedRequester = true;
        }
      }

      // 3. For anonymous submissions without phone number, knowing the private requestId confirms ownership
      if (!isAuthorizedRequester && !request.createdBy && !request.contactPhone) {
        isAuthorizedRequester = true;
      }

      if (!isAuthorizedRequester) {
        res.status(403).json({
          error: 'Access denied: Only the original requester (or matching registered contact phone) can confirm resolution and close this request. Responders and administrators cannot force-close requests.',
        });
        return;
      }

      request.status = 'closed';
      request.statusHistory.push({
        status: 'closed',
        changedAt: new Date(),
        changedBy: user ? new mongoose.Types.ObjectId(user.userId) : undefined,
        note: req.body.note || 'Resolution confirmed by requester; request closed',
      });

      await request.save();

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      res.status(200).json({
        message: `Request ${request.requestId} resolution confirmed. Request is now closed.`,
        request: sanitizeRequest(request, false),
      });
    } catch (error) {
      console.error('Confirm request error:', error);
      res.status(500).json({ error: 'Failed to confirm resolution.' });
    }
  }
);

export default router;
