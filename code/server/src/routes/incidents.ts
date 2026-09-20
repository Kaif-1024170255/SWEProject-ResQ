import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Incident, Request as RequestModel } from '../models';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

function getIncidentQuery(id: string): Record<string, any> {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { incidentId: id }] };
  }
  return { incidentId: id };
}

function getRequestQuery(id: string): Record<string, any> {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { requestId: id }] };
  }
  return { requestId: id };
}

// 1. POST /api/incidents - Admin creates a new incident
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, description, location, severity, requestIds } = req.body;

      if (!name || !description || !location || !location.description) {
        res.status(400).json({
          error: 'Incident name, description, and location description are required.',
        });
        return;
      }

      const uniqueSuffix = `${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const incidentId = req.body.incidentId || `INC-${uniqueSuffix}`;

      // Resolve any initial request IDs
      const resolvedRequestObjectIds: mongoose.Types.ObjectId[] = [];
      if (Array.isArray(requestIds) && requestIds.length > 0) {
        const foundRequests = await RequestModel.find({
          $or: [
            { _id: { $in: requestIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) } },
            { requestId: { $in: requestIds } },
          ],
        });
        for (const r of foundRequests) {
          resolvedRequestObjectIds.push(r._id as mongoose.Types.ObjectId);
        }
      }

      const incident = await Incident.create({
        incidentId,
        name: String(name).trim(),
        description: String(description).trim(),
        status: req.body.status || 'open',
        severity: severity || 'high',
        location: {
          description: String(location.description).trim(),
          lat: location.lat ? Number(location.lat) : undefined,
          lng: location.lng ? Number(location.lng) : undefined,
          radiusKm: location.radiusKm ? Number(location.radiusKm) : undefined,
        },
        requests: resolvedRequestObjectIds,
        createdBy: new mongoose.Types.ObjectId(req.user!.userId),
      });

      // Update linked requests with incidentId
      if (resolvedRequestObjectIds.length > 0) {
        await RequestModel.updateMany(
          { _id: { $in: resolvedRequestObjectIds } },
          { $set: { incidentId: incident._id } }
        );
      }

      res.status(201).json({
        success: true,
        incident,
      });
    } catch (error) {
      console.error('Create incident error:', error);
      res.status(500).json({ error: 'Failed to create incident.' });
    }
  }
);

// 2. GET /api/incidents - List all incidents
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, severity } = req.query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const incidents = await Incident.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role email');

    res.status(200).json({
      success: true,
      count: incidents.length,
      incidents,
    });
  } catch (error) {
    console.error('Fetch incidents error:', error);
    res.status(500).json({ error: 'Failed to retrieve incidents.' });
  }
});

// 3. GET /api/incidents/:id - Single incident details
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const incident = await Incident.findOne(getIncidentQuery(id))
      .populate('createdBy', 'name role email')
      .populate('requests', 'requestId category description status location createdAt');

    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      incident,
    });
  } catch (error) {
    console.error('Fetch single incident error:', error);
    res.status(500).json({ error: 'Failed to retrieve incident details.' });
  }
});

// 4. POST /api/incidents/:id/requests - Admin links existing requests to an incident
router.post(
  '/:id/requests',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : rawId;
      const { requestIds } = req.body;

      if (!Array.isArray(requestIds) || requestIds.length === 0) {
        res.status(400).json({ error: 'requestIds must be a non-empty array of request IDs.' });
        return;
      }

      const incident = await Incident.findOne(getIncidentQuery(id));
      if (!incident) {
        res.status(404).json({ error: 'Incident not found.' });
        return;
      }

      // Find requests matching IDs
      const foundRequests = await RequestModel.find({
        $or: [
          { _id: { $in: requestIds.filter((rid) => mongoose.Types.ObjectId.isValid(rid)).map((rid) => new mongoose.Types.ObjectId(rid)) } },
          { requestId: { $in: requestIds } },
        ],
      });

      if (foundRequests.length === 0) {
        res.status(404).json({ error: 'No matching requests found to link.' });
        return;
      }

      const existingSet = new Set(incident.requests.map((r) => r.toString()));
      const newlyLinkedIds: mongoose.Types.ObjectId[] = [];

      for (const reqDoc of foundRequests) {
        const idStr = reqDoc._id.toString();
        if (!existingSet.has(idStr)) {
          incident.requests.push(reqDoc._id as mongoose.Types.ObjectId);
          existingSet.add(idStr);
          newlyLinkedIds.push(reqDoc._id as mongoose.Types.ObjectId);
        }
      }

      await incident.save();

      if (newlyLinkedIds.length > 0) {
        await RequestModel.updateMany(
          { _id: { $in: newlyLinkedIds } },
          { $set: { incidentId: incident._id } }
        );
      }

      res.status(200).json({
        success: true,
        message: `Successfully linked ${newlyLinkedIds.length} request(s) to incident ${incident.incidentId}.`,
        linkedCount: newlyLinkedIds.length,
        incident,
      });
    } catch (error) {
      console.error('Link requests to incident error:', error);
      res.status(500).json({ error: 'Failed to link requests to incident.' });
    }
  }
);

// 5. GET /api/incidents/:id/requests - View all requests under a given incident
router.get('/:id/requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const incident = await Incident.findOne(getIncidentQuery(id));

    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    // Fetch requests by incidentId or by list in incident.requests
    const requests = await RequestModel.find({
      $or: [{ incidentId: incident._id }, { _id: { $in: incident.requests } }],
    })
      .select('-location.preciseLat -location.preciseLng -contactPhone')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      incidentId: incident.incidentId,
      incidentName: incident.name,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error('Fetch incident requests error:', error);
    res.status(500).json({ error: 'Failed to retrieve requests for incident.' });
  }
});

export default router;
