import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  Request as RequestModel,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  RequestCategory,
  RequestStatus,
  RequestAssignment,
  RequestResource,
  Resource,
  ResourceInventory,
  Organization,
  User,
  Verification,
  Notification,
  Message,
  Evidence,
  EmergencyCategory,
  calculateFuzzedCoordinates,
} from '../models';
import { requireAuth, requireRole } from '../middleware/auth';
import { JwtPayload } from '../types/auth';
import { sanitizeRequest } from '../utils/sanitize';
import {
  broadcastRequestCreated,
  broadcastRequestUpdated,
  broadcastAllocationUpdated,
  broadcastNotificationNew,
  broadcastMessageNew,
} from '../socket';
import { calculateMatchesForRequest } from '../services/matching';

const router = Router();

// Local disk storage configuration for evidence files
const uploadDir = path.join(process.cwd(), 'uploads', 'evidence');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const uploadEvidence = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB limit
  },
});

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

export { sanitizeRequest };

// 1. POST /api/requests - Public emergency request submission
router.post('/', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, description, preciseLat, preciseLng, contactPhone, address } = req.body;

    // Validation
    if (!category || !description || preciseLat === undefined || preciseLng === undefined) {
      res.status(400).json({
        error: 'Missing required fields: category, description, preciseLat, and preciseLng are required.',
      });
      return;
    }

    const normalizedCat = String(category).trim().toLowerCase();
    let isCategoryValid = REQUEST_CATEGORIES.includes(normalizedCat as any);
    let categoryDoc = null;

    if (!isCategoryValid) {
      categoryDoc = await EmergencyCategory.findOne({ name: normalizedCat, isActive: true });
      if (categoryDoc) {
        isCategoryValid = true;
      }
    } else {
      categoryDoc = await EmergencyCategory.findOne({ name: normalizedCat });
    }

    if (!isCategoryValid) {
      res.status(400).json({
        error: `Invalid category '${category}'. Must be a recognized emergency category.`,
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

    // Fuzz coordinates by 200-400m
    const fuzzed = calculateFuzzedCoordinates(latNum, lngNum);

    // Create request document
    const newRequest = new RequestModel({
      category: normalizedCat as RequestCategory,
      categoryRef: categoryDoc?._id,
      description: String(description).trim(),
      location: {
        preciseLat: latNum,
        preciseLng: lngNum,
        address: address && typeof address === 'string' ? address.trim() : undefined,
      },
      status: 'unverified',
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      createdBy: req.user ? req.user.userId : undefined,
    });

    await newRequest.save();

    // Real-time broadcast to public room (after successful DB write)
    broadcastRequestCreated(newRequest);

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

    // Exclude precise coordinates, address, and contact phone at database projection level
    const requests = await RequestModel.find(filter)
      .select('-location.preciseLat -location.preciseLng -location.address -contactPhone')
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

    let isOrgTeammate = false;
    if (viewer && viewer.role === 'ngo' && request.claimedOrg) {
      const viewerDoc = await User.findById(viewer.userId);
      if (
        viewerDoc?.organizationId &&
        viewerDoc.organizationId.toString() === request.claimedOrg.toString()
      ) {
        isOrgTeammate = true;
      }
    }

    if (isAdmin || isClaimant || isCreator || isOrgTeammate) {
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

// 4. PATCH /api/requests/:id/verify - Admin or verified NGO; unverified -> verified
router.patch(
  '/:id/verify',
  requireAuth,
  requireRole('admin', 'ngo'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const request = await RequestModel.findOne(getRequestQuery(id));

      if (!request) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      // Authorization & Conflict of interest checks
      if (req.user!.role === 'ngo') {
        const userDoc = await User.findById(req.user!.userId);
        if (!userDoc || !userDoc.organizationId) {
          res.status(403).json({
            error: 'Access denied: Only members of verified organizations are authorized to verify emergency requests.',
          });
          return;
        }

        const orgDoc = await Organization.findById(userDoc.organizationId);
        if (!orgDoc || !orgDoc.isVerified) {
          res.status(403).json({
            error: 'Access denied: Your organization is not verified. Only verified NGOs and administrators can verify emergency requests.',
          });
          return;
        }

        // Conflict of interest 1: cannot verify own submitted request
        if (request.createdBy && request.createdBy.toString() === req.user!.userId) {
          res.status(403).json({
            error: 'Conflict of interest: Responders cannot verify emergency requests that they submitted themselves.',
          });
          return;
        }

        // Conflict of interest 2: cannot verify submission by teammate from same organization
        if (request.createdBy) {
          const creatorDoc = await User.findById(request.createdBy);
          if (
            creatorDoc &&
            creatorDoc.organizationId &&
            creatorDoc.organizationId.toString() === userDoc.organizationId.toString()
          ) {
            res.status(403).json({
              error: 'Conflict of interest: Responders cannot verify emergency requests submitted by members of their own organization.',
            });
            return;
          }
        }
      } else if (req.user!.role === 'admin') {
        // Conflict of interest check: admin cannot verify their own submitted request
        if (request.createdBy && request.createdBy.toString() === req.user!.userId) {
          res.status(403).json({
            error: 'Conflict of interest: Administrators cannot verify emergency requests that they submitted themselves. Verification must be performed by an independent dispatcher.',
          });
          return;
        }
      }

      if (request.status !== 'unverified') {
        res.status(400).json({
          error: `Cannot verify request: current status is '${request.status}', expected 'unverified'. Lifecycle order cannot be skipped or reversed.`,
        });
        return;
      }

      const remarks = req.body.remarks !== undefined ? req.body.remarks : req.body.note;
      const remarksText = remarks ? String(remarks).trim() : undefined;
      const result = req.body.result || 'verified_legitimate';
      const isRejected = result === 'duplicate' || result === 'unfounded' || result === 'spam_or_hoax';

      const defaultVerifyNote =
        req.user!.role === 'ngo'
          ? 'Request verified by field NGO partner'
          : 'Request verified by administrator';

      if (isRejected) {
        request.status = 'closed';
        request.statusHistory.push({
          status: 'closed',
          changedAt: new Date(),
          changedBy: new mongoose.Types.ObjectId(req.user!.userId),
          note: remarksText || `Request closed during verification: ${result}`,
        });
      } else {
        request.status = 'verified';
        request.statusHistory.push({
          status: 'verified',
          changedAt: new Date(),
          changedBy: new mongoose.Types.ObjectId(req.user!.userId),
          note: remarksText || defaultVerifyNote,
        });
      }

      await request.save();

      // Create detailed Verification record alongside statusHistory
      const verification = new Verification({
        request: request._id,
        verifiedBy: new mongoose.Types.ObjectId(req.user!.userId),
        timestamp: new Date(),
        result,
        remarks: remarksText,
        method: req.body.method || 'phone_call',
        priorityAssessment: req.body.priorityAssessment,
      });
      await verification.save();

      // Automatically notify requester if submitted by authenticated user
      if (request.createdBy) {
        const notifTitle = isRejected ? 'Request Evaluation Complete' : 'Request Verified';
        const notifMsg = isRejected
          ? `Your emergency request ${request.requestId} was evaluated as ${result} and has been closed.`
          : `Your emergency request ${request.requestId} has been verified by dispatch and is queued for responder deployment.`;

        const notif = await Notification.create({
          recipient: request.createdBy,
          request: request._id,
          type: isRejected ? 'system_alert' : 'request_verified',
          title: notifTitle,
          message: notifMsg,
        });
        broadcastNotificationNew(request.createdBy.toString(), notif);
      }

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      // Real-time broadcast after successful DB writes
      broadcastRequestUpdated(request);

      res.status(200).json({
        message: isRejected
          ? `Request ${request.requestId} has been marked as ${result} and archived.`
          : `Request ${request.requestId} has been verified and is ready to be claimed.`,
        request: sanitizeRequest(request, true),
      });
    } catch (error) {
      console.error('Verify request error:', error);
      res.status(500).json({ error: 'Failed to verify request.' });
    }
  }
);

// 4b. GET /api/requests/:id/verification - Retrieve verification record
router.get(
  '/:id/verification',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const verification = await Verification.findOne({ request: requestDoc._id })
        .populate('verifiedBy', 'name email role')
        .sort({ createdAt: -1 });

      if (!verification) {
        res.status(404).json({ error: 'No verification record found for this request.' });
        return;
      }

      res.status(200).json({ verification });
    } catch (error) {
      console.error('Get verification error:', error);
      res.status(500).json({ error: 'Failed to retrieve verification record.' });
    }
  }
);

// 5. PATCH /api/requests/:id/claim - Volunteer or NGO only; verified -> in_progress
router.patch(
  '/:id/claim',
  requireAuth,
  requireRole('volunteer', 'ngo'),
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

      let claimantOrgId: mongoose.Types.ObjectId | undefined = undefined;
      if (req.user!.role === 'ngo') {
        const claimantUser = await User.findById(req.user!.userId);
        if (claimantUser?.organizationId) {
          claimantOrgId = claimantUser.organizationId;
          request.claimedOrg = claimantOrgId;
        }
      }

      request.statusHistory.push({
        status: 'in_progress',
        changedAt: new Date(),
        changedBy: new mongoose.Types.ObjectId(req.user!.userId),
        note: req.body.note || 'Claimed by responder',
      });

      await request.save();

      // Create RequestAssignment record for Time-to-Match and dispatch audit trail
      const assignment = new RequestAssignment({
        request: request._id,
        assignedTo: new mongoose.Types.ObjectId(req.user!.userId),
        assignedBy: new mongoose.Types.ObjectId(req.user!.userId),
        assignedOrg: claimantOrgId,
        role: 'lead',
        status: 'assigned',
        assignedAt: new Date(),
        notes: req.body.note || 'Claimed by responder',
      });
      await assignment.save();

      // Automatically notify requester if submitted by authenticated user
      if (request.createdBy) {
        const notif = await Notification.create({
          recipient: request.createdBy,
          request: request._id,
          type: 'request_claimed',
          title: 'Responder Assigned',
          message: `A responder has claimed your request ${request.requestId} and is responding.`,
        });
        broadcastNotificationNew(request.createdBy.toString(), notif);
      }

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');
      if (request.claimedOrg) {
        await request.populate('claimedOrg', 'name type isVerified');
      }

      // Real-time broadcast after successful DB writes
      broadcastAllocationUpdated(request.requestId, {
        requestId: request.requestId,
        assignment,
      });
      broadcastRequestUpdated(request, { claimantId: req.user!.userId });

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

// 6. PATCH /api/requests/:id/resolve - Claimant, org teammate, or admin; in_progress -> resolved
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

      let isOrgTeammate = false;
      if (req.user!.role === 'ngo' && request.claimedOrg) {
        const resolvingUser = await User.findById(req.user!.userId);
        if (
          resolvingUser?.organizationId &&
          resolvingUser.organizationId.toString() === request.claimedOrg.toString()
        ) {
          isOrgTeammate = true;
        }
      }

      if (!isClaimant && !isAdmin && !isOrgTeammate) {
        res.status(403).json({
          error:
            'Access denied: Only the assigned claimant or an administrator (or authorized teammate from the claiming organization) can mark this request as resolved.',
        });
        return;
      }

      request.status = 'resolved';
      const defaultNote = isOrgTeammate
        ? 'Marked as resolved by NGO teammate'
        : 'Marked as resolved by responder/admin';
      request.statusHistory.push({
        status: 'resolved',
        changedAt: new Date(),
        changedBy: new mongoose.Types.ObjectId(req.user!.userId),
        note: req.body.note || defaultNote,
      });

      await request.save();

      // Complete active assignments on resolve
      await RequestAssignment.updateMany(
        {
          request: request._id,
          status: { $in: ['assigned', 'accepted', 'en_route', 'on_scene'] },
        },
        { status: 'completed', completedAt: new Date() }
      );

      // Automatically notify requester if submitted by authenticated user
      if (request.createdBy) {
        const notif = await Notification.create({
          recipient: request.createdBy,
          request: request._id,
          type: 'request_resolved',
          title: 'Request Marked Resolved',
          message: `Your request ${request.requestId} has been marked as resolved by responder/admin. Please confirm when safe to close.`,
        });
        broadcastNotificationNew(request.createdBy.toString(), notif);
      }

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      // Real-time broadcast after successful DB writes
      broadcastAllocationUpdated(request.requestId, {
        requestId: request.requestId,
        status: 'completed',
      });
      broadcastRequestUpdated(request);

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

      // Real-time broadcast after successful DB writes
      broadcastRequestUpdated(request);

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

// 7b. PATCH /api/requests/:id/cancel - Requester (before resolved) or Admin (before closed); terminal -> cancelled
router.patch(
  '/:id/cancel',
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

      if (request.status === 'closed' || request.status === 'cancelled') {
        res.status(400).json({
          error: `Cannot cancel request: request is already ${request.status}.`,
        });
        return;
      }

      const user = req.user;
      const isAdmin = user && user.role === 'admin';
      const { contactPhone, reason } = req.body;
      let isAuthorized = false;

      // 1. Admin can cancel any request prior to closed
      if (isAdmin) {
        isAuthorized = true;
      }

      // 2. Authenticated creator
      if (!isAuthorized && request.createdBy && user && request.createdBy.toString() === user.userId) {
        isAuthorized = true;
      }

      // 3. Anonymous submitter with matching contact phone
      if (!isAuthorized && request.contactPhone) {
        const normalize = (p: string) => {
          const digits = String(p).replace(/\D/g, '');
          return digits.length >= 10 ? digits.slice(-10) : digits;
        };
        if (contactPhone && normalize(contactPhone) === normalize(request.contactPhone)) {
          isAuthorized = true;
        }
      }

      // 4. Anonymous submission without contact phone, authorized by knowledge of private request ID
      if (!isAuthorized && !request.createdBy && !request.contactPhone) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        res.status(403).json({
          error: 'Access denied: Only the original requester (or an administrator) can withdraw this emergency request.',
        });
        return;
      }

      // Requesters can only withdraw before resolved (i.e. unverified, verified, in_progress)
      if (!isAdmin && request.status === 'resolved') {
        res.status(400).json({
          error: 'Cannot withdraw request: assistance has already been reported resolved. Please confirm resolution or contact dispatch.',
        });
        return;
      }

      // Release any reserved resources and cancel assignments
      try {
        const reqResources = await RequestResource.find({ request: request._id, quantityAllocated: { $gt: 0 } });
        for (const rr of reqResources) {
          const inv = await ResourceInventory.findOne({
            resource: rr.resource,
            quantityReserved: { $gte: rr.quantityAllocated },
          });
          if (inv) {
            await inv.release(rr.quantityAllocated);
          }
          await rr.deallocate(rr.quantityAllocated);
        }

        await RequestAssignment.updateMany(
          {
            request: request._id,
            status: { $in: ['assigned', 'accepted', 'en_route', 'on_scene'] },
          },
          { status: 'cancelled', completedAt: new Date(), notes: 'Request cancelled / withdrawn' }
        );
      } catch (cleanupErr) {
        console.error('Error cleaning up allocations on cancellation:', cleanupErr);
      }

      const cancelNote =
        reason && typeof reason === 'string' && reason.trim()
          ? reason.trim()
          : isAdmin
          ? 'Cancelled by administrator'
          : 'Withdrawn by requester (safe/resolved independently)';

      request.status = 'cancelled';
      request.statusHistory.push({
        status: 'cancelled',
        changedAt: new Date(),
        changedBy: user ? new mongoose.Types.ObjectId(user.userId) : undefined,
        note: cancelNote,
      });

      await request.save();

      // If claimed, notify claimant responder
      if (request.claimedBy) {
        const notif = await Notification.create({
          recipient: request.claimedBy,
          request: request._id,
          type: 'system_alert',
          title: 'Request Withdrawn',
          message: `Emergency request ${request.requestId} has been withdrawn (${cancelNote}). Response mission stood down.`,
        });
        broadcastNotificationNew(request.claimedBy.toString(), notif);
      }

      // If cancelled by admin and requester is registered user, notify requester
      if (isAdmin && request.createdBy && request.createdBy.toString() !== user?.userId) {
        const notif = await Notification.create({
          recipient: request.createdBy,
          request: request._id,
          type: 'system_alert',
          title: 'Request Cancelled by Dispatch',
          message: `Your emergency request ${request.requestId} was cancelled by dispatch: "${cancelNote}".`,
        });
        broadcastNotificationNew(request.createdBy.toString(), notif);
      }

      await request.populate('createdBy', 'name role');
      await request.populate('claimedBy', 'name role');

      broadcastRequestUpdated(request);

      res.status(200).json({
        message: `Request ${request.requestId} has been withdrawn/cancelled.`,
        request: sanitizeRequest(request, true),
      });
    } catch (error) {
      console.error('Cancel request error:', error);
      res.status(500).json({ error: 'Failed to cancel request.' });
    }
  }
);

/**
 * Computes a request's resource allocation status across all required resources.
 */
export async function calculateRequestAllocationStatus(
  requestId: mongoose.Types.ObjectId | string
): Promise<{
  status: 'unallocated' | 'partially_allocated' | 'fully_allocated';
  totalRequired: number;
  totalAllocated: number;
  resources: any[];
}> {
  const requirements = await RequestResource.find({ request: requestId }).populate(
    'resource',
    'name category unit'
  );

  if (requirements.length === 0) {
    const assignments = await RequestAssignment.find({ request: requestId });
    return {
      status: assignments.length > 0 ? 'fully_allocated' : 'unallocated',
      totalRequired: 0,
      totalAllocated: 0,
      resources: [],
    };
  }

  let totalRequired = 0;
  let totalAllocated = 0;
  let allFullyAllocated = true;
  let anyAllocated = false;

  for (const item of requirements) {
    totalRequired += item.quantityRequested;
    totalAllocated += item.quantityAllocated;

    if (item.quantityAllocated < item.quantityRequested) {
      allFullyAllocated = false;
    }
    if (item.quantityAllocated > 0) {
      anyAllocated = true;
    }
  }

  let status: 'unallocated' | 'partially_allocated' | 'fully_allocated';
  if (allFullyAllocated) {
    status = 'fully_allocated';
  } else if (anyAllocated) {
    status = 'partially_allocated';
  } else {
    status = 'unallocated';
  }

  return {
    status,
    totalRequired,
    totalAllocated,
    resources: requirements,
  };
}

// 8. POST /api/requests/:id/resources - Associate a required resource with an emergency request
router.post(
  '/:id/resources',
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      // Authorization check: original requester, admin, or current claimant
      const user = req.user;
      const contactPhoneInput = (req.body.contactPhone ||
        req.query.contactPhone ||
        req.headers['x-contact-phone']) as string | undefined;
      let isAuthorized = false;

      // 1. Admin
      if (user && user.role === 'admin') {
        isAuthorized = true;
      }

      // 2. Current Claimant (assigned responder)
      if (
        !isAuthorized &&
        user &&
        requestDoc.claimedBy &&
        requestDoc.claimedBy.toString() === user.userId
      ) {
        isAuthorized = true;
      }

      // 3. Original Requester (Authenticated User)
      if (
        !isAuthorized &&
        user &&
        requestDoc.createdBy &&
        requestDoc.createdBy.toString() === user.userId
      ) {
        isAuthorized = true;
      }

      // 4. Anonymous Requester (Verified via matching contact phone)
      if (!isAuthorized && requestDoc.contactPhone && contactPhoneInput) {
        const normalize = (p: string) => {
          const digits = String(p).replace(/\D/g, '');
          return digits.length >= 10 ? digits.slice(-10) : digits;
        };
        if (normalize(contactPhoneInput) === normalize(requestDoc.contactPhone)) {
          isAuthorized = true;
        }
      }

      // 5. Completely anonymous request with neither account nor contact phone recorded
      if (!isAuthorized && !requestDoc.createdBy && !requestDoc.contactPhone) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        res.status(403).json({
          error:
            'Access denied: Only the original requester, an administrator, or the assigned claimant can add or update resource requirements for this request.',
        });
        return;
      }

      const { resourceId, quantityRequested } = req.body;
      if (!resourceId || !mongoose.isValidObjectId(resourceId)) {
        res.status(400).json({ error: 'Valid resourceId is required.' });
        return;
      }

      const qty = Number(quantityRequested);
      if (isNaN(qty) || qty <= 0) {
        res.status(400).json({ error: 'quantityRequested must be a positive number.' });
        return;
      }

      const resourceDoc = await Resource.findById(resourceId);
      if (!resourceDoc) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }

      let requestResource = await RequestResource.findOne({
        request: requestDoc._id,
        resource: resourceDoc._id,
      });

      if (requestResource) {
        requestResource.quantityRequested += qty;
        if (requestResource.quantityAllocated >= requestResource.quantityRequested) {
          requestResource.status = 'fully_allocated';
        } else if (requestResource.quantityAllocated > 0) {
          requestResource.status = 'partially_allocated';
        } else {
          requestResource.status = 'pending';
        }
        await requestResource.save();
      } else {
        requestResource = new RequestResource({
          request: requestDoc._id,
          resource: resourceDoc._id,
          quantityRequested: qty,
          quantityAllocated: 0,
          status: 'pending',
        });
        await requestResource.save();
      }

      await requestResource.populate('resource', 'name category unit');

      const overallAfterAssociate = await calculateRequestAllocationStatus(requestDoc._id);
      broadcastAllocationUpdated(
        requestDoc.requestId,
        {
          requestId: requestDoc.requestId,
          requestResource,
          overallAllocation: overallAfterAssociate.status,
          totalRequired: overallAfterAssociate.totalRequired,
          totalAllocated: overallAfterAssociate.totalAllocated,
          resources: overallAfterAssociate.resources,
        },
        requestDoc._id.toString()
      );

      res.status(201).json({
        message: 'Resource requirement associated with request.',
        requestResource,
      });
    } catch (error) {
      console.error('Associate request resource error:', error);
      res.status(500).json({ error: 'Failed to associate resource requirement.' });
    }
  }
);

// 9. GET /api/requests/:id/resources - List resource requirements for a request
router.get(
  '/:id/resources',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const resources = await RequestResource.find({ request: requestDoc._id }).populate(
        'resource',
        'name category unit description'
      );

      res.status(200).json({ resources });
    } catch (error) {
      console.error('Get request resources error:', error);
      res.status(500).json({ error: 'Failed to retrieve request resources.' });
    }
  }
);

// 10. POST /api/requests/:id/allocate - Allocate a resource towards a request requirement
router.post(
  '/:id/allocate',
  requireAuth,
  requireRole('ngo', 'resource_provider'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const { resourceId, quantity, notes } = req.body;
      if (!resourceId || !mongoose.isValidObjectId(resourceId)) {
        res.status(400).json({ error: 'Valid resourceId is required.' });
        return;
      }

      const qty = Number(quantity);
      if (isNaN(qty) || qty <= 0) {
        res.status(400).json({ error: 'Allocation quantity must be a positive number.' });
        return;
      }

      const resourceDoc = await Resource.findById(resourceId);
      if (!resourceDoc) {
        res.status(404).json({ error: 'Resource not found.' });
        return;
      }

      // Check caller's account or organization for real available depot inventory
      const userDoc = await User.findById(req.user!.userId);
      const orgId = userDoc?.organizationId;
      const inventoryQuery: Record<string, any> = {
        resource: resourceDoc._id,
      };

      if (req.body.inventoryId && mongoose.isValidObjectId(req.body.inventoryId)) {
        inventoryQuery._id = req.body.inventoryId;
      }

      if (orgId) {
        inventoryQuery.$or = [
          { ownerId: orgId },
          { organization: orgId },
          { ownerId: userDoc!._id },
        ];
      } else {
        inventoryQuery.ownerId = userDoc!._id;
      }

      const inventoryDoc = await ResourceInventory.findOne(inventoryQuery);
      if (!inventoryDoc) {
        res.status(400).json({
          error: 'No inventory record found for this resource under your account or organization. You must have registered depot stock to allocate supplies.',
        });
        return;
      }

      if (inventoryDoc.quantityAvailable < qty) {
        res.status(400).json({
          error: `Insufficient available inventory: requested allocation of ${qty} exceeds available stock of ${inventoryDoc.quantityAvailable}.`,
        });
        return;
      }

      // Atomically reserve the allocated stock from inventory
      await inventoryDoc.reserve(qty);

      let reqResource = await RequestResource.findOne({
        request: requestDoc._id,
        resource: resourceDoc._id,
      });

      if (!reqResource) {
        reqResource = new RequestResource({
          request: requestDoc._id,
          resource: resourceDoc._id,
          quantityRequested: qty,
          quantityAllocated: qty,
          status: 'fully_allocated',
        });
        await reqResource.save();
      } else {
        await reqResource.allocate(qty);
      }

      // Create RequestAssignment tracking this contribution
      const assignment = new RequestAssignment({
        request: requestDoc._id,
        assignedTo: new mongoose.Types.ObjectId(req.user!.userId),
        assignedBy: new mongoose.Types.ObjectId(req.user!.userId),
        resource: resourceDoc._id,
        quantityAllocated: qty,
        role: 'support',
        status: 'assigned',
        assignedAt: new Date(),
        notes: notes ? String(notes).trim() : 'Resource allocated towards request requirement',
      });
      await assignment.save();

      const overall = await calculateRequestAllocationStatus(requestDoc._id);

      await reqResource.populate('resource', 'name category unit');

      // Real-time broadcast to request room after DB write
      broadcastAllocationUpdated(
        requestDoc.requestId,
        {
          requestId: requestDoc.requestId,
          requestResource: reqResource,
          assignment,
          overallAllocation: overall.status,
          totalRequired: overall.totalRequired,
          totalAllocated: overall.totalAllocated,
          resources: overall.resources,
        },
        requestDoc._id.toString()
      );

      // Trigger automatic in-app notifications for requester and assigned claimant
      try {
        const unitName = resourceDoc.unit ? `${resourceDoc.unit} of ` : '';
        if (requestDoc.createdBy) {
          const creatorNotif = await Notification.create({
            recipient: requestDoc.createdBy,
            request: requestDoc._id,
            type: 'system_alert',
            title: `Resource allocated to ${requestDoc.requestId}`,
            message: `${qty} ${unitName}${resourceDoc.name} contributed towards your request.`,
          });
          broadcastNotificationNew(requestDoc.createdBy.toString(), creatorNotif);
        }

        if (
          requestDoc.claimedBy &&
          requestDoc.claimedBy.toString() !== req.user!.userId
        ) {
          const claimantNotif = await Notification.create({
            recipient: requestDoc.claimedBy,
            request: requestDoc._id,
            type: 'system_alert',
            title: `Resource contribution on ${requestDoc.requestId}`,
            message: `${qty} ${unitName}${resourceDoc.name} contributed towards mission fulfillment.`,
          });
          broadcastNotificationNew(requestDoc.claimedBy.toString(), claimantNotif);
        }
      } catch (notifErr) {
        console.error('Error generating notification for resource allocation:', notifErr);
      }

      res.status(200).json({
        message: `Successfully allocated ${qty} unit(s) of ${resourceDoc.name}.`,
        requestResource: reqResource,
        assignment,
        overallAllocation: overall.status,
      });
    } catch (error) {
      console.error('Allocate resource error:', error);
      res.status(500).json({ error: 'Failed to allocate resource.' });
    }
  }
);

// 11. GET /api/requests/:id/allocation - View overall allocation status of a request
router.get(
  '/:id/allocation',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const result = await calculateRequestAllocationStatus(requestDoc._id);

      res.status(200).json({
        requestId: requestDoc.requestId,
        allocationStatus: result.status,
        totalRequired: result.totalRequired,
        totalAllocated: result.totalAllocated,
        resources: result.resources,
      });
    } catch (error) {
      console.error('Get allocation status error:', error);
      res.status(500).json({ error: 'Failed to retrieve allocation status.' });
    }
  }
);

/**
 * Helper to authorize messaging participants:
 * - Admin
 * - Claimant (assigned responder)
 * - Authenticated creator
 * - Anonymous requester verified via contact phone
 * - Anonymous requester without phone (owning requestId)
 */
async function authorizeMessageParticipant(
  requestDoc: any,
  user: JwtPayload | undefined,
  phoneInput?: string
): Promise<{ isAuthorized: boolean; senderRole?: 'admin' | 'claimant' | 'requester'; senderName?: string }> {
  const isTriage = requestDoc.status === 'unverified' || requestDoc.status === 'verified';

  // 1. Admin is always authorized (both triage and post-claim)
  if (user && user.role === 'admin') {
    return { isAuthorized: true, senderRole: 'admin', senderName: user.name || 'Central Dispatch' };
  }

  // 2. Claimant is only authorized post-claim (not during triage)
  if (!isTriage && user) {
    if (requestDoc.claimedBy && requestDoc.claimedBy.toString() === user.userId) {
      return { isAuthorized: true, senderRole: 'claimant', senderName: user.name || 'Assigned Responder' };
    }
    // Org teammate authorization
    if (user.role === 'ngo' && requestDoc.claimedOrg) {
      const userDoc = await User.findById(user.userId);
      if (
        userDoc?.organizationId &&
        userDoc.organizationId.toString() === requestDoc.claimedOrg.toString()
      ) {
        return {
          isAuthorized: true,
          senderRole: 'claimant',
          senderName: `${user.name || 'NGO Responder'} (Teammate)`,
        };
      }
    }
  }

  // 3. Authenticated requester who created the ticket
  if (user && requestDoc.createdBy && requestDoc.createdBy.toString() === user.userId) {
    return { isAuthorized: true, senderRole: 'requester', senderName: user.name || 'Requester' };
  }

  // 4. Anonymous requester verified via matching contact phone
  const normalize = (p: string) => {
    const digits = String(p).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };
  if (requestDoc.contactPhone && phoneInput && normalize(phoneInput) === normalize(requestDoc.contactPhone)) {
    return { isAuthorized: true, senderRole: 'requester', senderName: 'Requester (Phone Verified)' };
  }

  // 5. Completely anonymous requester (only when not authenticated as an unrelated role)
  if (!user && !requestDoc.createdBy && !requestDoc.contactPhone) {
    return { isAuthorized: true, senderRole: 'requester', senderName: 'Requester (Anonymous)' };
  }

  return { isAuthorized: false };
}

// 12. GET /api/requests/:id/messages - Fetch thread history for a request
router.get(
  '/:id/messages',
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      // Authorization Check: participant validation
      const phoneParam = (req.query.phone || req.query.contactPhone || req.headers['x-contact-phone']) as string | undefined;
      const auth = await authorizeMessageParticipant(requestDoc, req.user, phoneParam);

      if (!auth.isAuthorized) {
        res.status(403).json({
          error: 'Access denied: Only authorized participants (claimant responder, requester, or administrator) can access this message thread.',
        });
        return;
      }

      const messages = await Message.find({ request: requestDoc._id }).sort({ createdAt: 1 });

      res.status(200).json({
        success: true,
        count: messages.length,
        messages,
      });
    } catch (error) {
      console.error('Fetch messages error:', error);
      res.status(500).json({ error: 'Failed to retrieve message thread.' });
    }
  }
);

// 13. POST /api/requests/:id/messages - Post a new message to a request thread
router.post(
  '/:id/messages',
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      // 1. Input validation
      const { body, contactPhone } = req.body;
      if (!body || typeof body !== 'string' || !body.trim()) {
        res.status(400).json({ error: 'Message body cannot be empty.' });
        return;
      }

      // 2. Authorization Check
      const phoneInput = contactPhone || req.body.senderPhone || (req.query.phone as string);
      const auth = await authorizeMessageParticipant(requestDoc, req.user, phoneInput);

      if (!auth.isAuthorized) {
        res.status(403).json({
          error: 'Access denied: Only the claimant responder, original requester, or an administrator can post messages to this request.',
        });
        return;
      }

      // 4. Create Message
      const message = await Message.create({
        request: requestDoc._id,
        sender: req.user ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        senderRole: auth.senderRole,
        senderName: auth.senderName,
        senderPhone: phoneInput ? String(phoneInput).trim() : undefined,
        body: body.trim(),
      });

      // Real-time broadcast to authorized request room after DB write
      broadcastMessageNew(requestDoc.requestId, message, requestDoc._id.toString());

      // 5. Automatic Notification trigger
      try {
        const bodySnippet = body.trim().slice(0, 100) + (body.trim().length > 100 ? '...' : '');

        if (auth.senderRole === 'claimant' && requestDoc.createdBy) {
          const notif = await Notification.create({
            recipient: requestDoc.createdBy,
            request: requestDoc._id,
            type: 'new_message',
            title: `New message on ${requestDoc.requestId}`,
            message: `${auth.senderName}: "${bodySnippet}"`,
          });
          broadcastNotificationNew(requestDoc.createdBy.toString(), notif);
        } else if (auth.senderRole === 'requester' && requestDoc.claimedBy) {
          const notif = await Notification.create({
            recipient: requestDoc.claimedBy,
            request: requestDoc._id,
            type: 'new_message',
            title: `New message on ${requestDoc.requestId}`,
            message: `${auth.senderName}: "${bodySnippet}"`,
          });
          broadcastNotificationNew(requestDoc.claimedBy.toString(), notif);
        } else if (auth.senderRole === 'admin') {
          const recipients = ([requestDoc.createdBy, requestDoc.claimedBy] as (mongoose.Types.ObjectId | undefined)[]).filter(
            (id): id is mongoose.Types.ObjectId => Boolean(id) && id!.toString() !== req.user?.userId
          );
          const uniqueRecipients = Array.from(new Set(recipients.map((r) => r.toString())));
          for (const recId of uniqueRecipients) {
            const notif = await Notification.create({
              recipient: new mongoose.Types.ObjectId(recId),
              request: requestDoc._id,
              type: 'new_message',
              title: `Dispatch message on ${requestDoc.requestId}`,
              message: `Central Dispatch: "${bodySnippet}"`,
            });
            broadcastNotificationNew(recId, notif);
          }
        }
      } catch (notifErr) {
        console.error('Error generating notification for new message:', notifErr);
      }

      res.status(201).json({
        success: true,
        message,
      });
    } catch (error) {
      console.error('Post message error:', error);
      res.status(500).json({ error: 'Failed to post message.' });
    }
  }
);

// 14. POST /api/requests/:id/evidence - Upload supporting evidence file & save metadata
router.post(
  '/:id/evidence',
  optionalAuth,
  uploadEvidence.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Please attach a file under field "file".' });
        return;
      }

      const uploader = req.user ? new mongoose.Types.ObjectId(req.user.userId) : undefined;
      let uploaderName = 'Anonymous Informant';
      if (req.user) {
        uploaderName = req.user.name || `${req.user.role.toUpperCase()} Responder`;
      } else if (req.body.uploaderName) {
        uploaderName = String(req.body.uploaderName).trim();
      }

      const evidence = await Evidence.create({
        request: requestDoc._id,
        uploader,
        uploaderName,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileUrl: `/uploads/evidence/${req.file.filename}`,
        fileSize: req.file.size,
        description: req.body.description ? String(req.body.description).trim() : undefined,
        uploadedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        message: 'Evidence attachment logged successfully.',
        evidence,
      });
    } catch (error) {
      console.error('Evidence upload error:', error);
      res.status(500).json({ error: 'Failed to process evidence upload.' });
    }
  }
);

// 15. GET /api/requests/:id/evidence - List all evidence attachments for a request
router.get(
  '/:id/evidence',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const evidenceList = await Evidence.find({ request: requestDoc._id })
        .sort({ uploadedAt: -1 })
        .populate('uploader', 'name role email');

      res.status(200).json({
        success: true,
        count: evidenceList.length,
        evidence: evidenceList,
      });
    } catch (error) {
      console.error('Fetch evidence error:', error);
      res.status(500).json({ error: 'Failed to retrieve evidence list.' });
    }
  }
);

// 16. GET /api/requests/:id/matches - Get ranked candidate suggestions for a request
router.get(
  '/:id/matches',
  requireAuth,
  requireRole('admin', 'ngo'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await calculateMatchesForRequest(id);

      if (!result) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Calculate matches error:', error);
      res.status(500).json({ error: 'Failed to calculate candidate matches.' });
    }
  }
);

// 17. POST /api/requests/:id/invite - Dispatcher sends an invitation notification to a matched candidate
router.post(
  '/:id/invite',
  requireAuth,
  requireRole('admin', 'ngo'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const requestDoc = await RequestModel.findOne(getRequestQuery(id));

      if (!requestDoc) {
        res.status(404).json({ error: 'Request not found.' });
        return;
      }

      const { candidateId, message: customMessage } = req.body;
      if (!candidateId || !mongoose.isValidObjectId(candidateId)) {
        res.status(400).json({ error: 'Valid candidateId is required.' });
        return;
      }

      const candidateUser = await User.findById(candidateId);
      if (!candidateUser) {
        res.status(404).json({ error: 'Candidate user not found.' });
        return;
      }

      // Check if already invited for this request
      const existingInvite = await Notification.findOne({
        recipient: candidateUser._id,
        request: requestDoc._id,
        type: 'dispatch_invite',
      });
      if (existingInvite) {
        res.status(400).json({ error: `${candidateUser.name} already has an active invitation for this request.` });
        return;
      }

      const senderName =
        req.user?.name || (req.user?.role === 'admin' ? 'Central Dispatch' : 'NGO Coordinator');
      const notifTitle = `Dispatch Match Invitation: ${requestDoc.requestId}`;
      const notifBody = customMessage
        ? String(customMessage).trim()
        : `${senderName} has invited you to respond to emergency request ${requestDoc.requestId} (${requestDoc.category.toUpperCase()}). Check details and claim if available.`;

      const notification = await Notification.create({
        recipient: candidateUser._id,
        request: requestDoc._id,
        type: 'dispatch_invite',
        title: notifTitle,
        message: notifBody,
      });

      // Broadcast real-time notification to the invited candidate's private room
      broadcastNotificationNew(candidateUser._id.toString(), notification);

      res.status(200).json({
        success: true,
        message: `Invitation successfully dispatched to ${candidateUser.name}.`,
        data: {
          notification,
        },
      });
    } catch (error) {
      console.error('Invite candidate error:', error);
      res.status(500).json({ error: 'Failed to dispatch candidate invitation.' });
    }
  }
);

export default router;

