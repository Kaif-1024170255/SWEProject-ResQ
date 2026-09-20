import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Resource, ResourceInventory, Organization, User } from '../models';
import { requireAuth } from '../middleware/auth';

const router = Router();

// 1. POST /api/resources - Register a new resource (against an Organization or individual provider)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      category,
      unit,
      description,
      organizationId,
      isPerishable,
      initialQuantity,
      location,
      notes,
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Resource name is required.' });
      return;
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      res.status(400).json({ error: 'Resource category is required.' });
      return;
    }

    if (!unit || typeof unit !== 'string' || unit.trim().length === 0) {
      res.status(400).json({ error: 'Resource unit of measure is required.' });
      return;
    }

    let ownerType: 'Organization' | 'User' = 'User';
    let ownerId: mongoose.Types.ObjectId = new mongoose.Types.ObjectId(req.user!.userId);

    if (organizationId) {
      if (!mongoose.isValidObjectId(organizationId)) {
        res.status(400).json({ error: 'Invalid organizationId format.' });
        return;
      }

      const org = await Organization.findById(organizationId);
      if (!org) {
        res.status(404).json({ error: 'Organization not found.' });
        return;
      }

      const user = await User.findById(req.user!.userId);
      const isOwner = org.primaryContact && org.primaryContact.toString() === req.user!.userId;
      const isMember = user?.organizationId && user.organizationId.toString() === org._id.toString();
      const isAdmin = req.user!.role === 'admin';

      if (!isOwner && !isMember && !isAdmin) {
        res.status(403).json({
          error: 'Access denied: You do not belong to or manage this organization.',
        });
        return;
      }

      ownerType = 'Organization';
      ownerId = org._id as mongoose.Types.ObjectId;
    }

    // Create the resource
    const resource = new Resource({
      name: name.trim(),
      category: category.trim().toLowerCase(),
      unit: unit.trim().toLowerCase(),
      description: description ? String(description).trim() : undefined,
      ownerType,
      ownerId,
      isPerishable: Boolean(isPerishable),
    });

    await resource.save();

    // Create corresponding inventory record
    const quantity =
      typeof initialQuantity === 'number' && initialQuantity >= 0 ? initialQuantity : 0;

    const inventory = new ResourceInventory({
      resource: resource._id,
      organization: ownerType === 'Organization' ? ownerId : undefined,
      ownerType,
      ownerId,
      quantityAvailable: quantity,
      quantityReserved: 0,
      location: location || undefined,
      status: quantity > 0 ? 'available' : 'depleted',
      notes: notes ? String(notes).trim() : undefined,
    });

    await inventory.save();

    res.status(201).json({
      message: 'Resource registered successfully',
      resource,
      inventory,
    });
  } catch (error) {
    console.error('Register resource error:', error);
    res.status(500).json({ error: 'Failed to register resource.' });
  }
});

// 2. GET /api/resources - List registered resources
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = {};

    if (req.query.category && typeof req.query.category === 'string') {
      filter.category = req.query.category.toLowerCase();
    }

    if (req.query.organizationId && typeof req.query.organizationId === 'string') {
      if (mongoose.isValidObjectId(req.query.organizationId)) {
        filter.ownerType = 'Organization';
        filter.ownerId = req.query.organizationId;
      }
    }

    const resources = await Resource.find(filter).sort({ createdAt: -1 });

    res.status(200).json({ resources });
  } catch (error) {
    console.error('Fetch resources error:', error);
    res.status(500).json({ error: 'Failed to retrieve resources.' });
  }
});

// 3. GET /api/resources/:id - Get single resource details
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid resource ID format.' });
      return;
    }

    const resource = await Resource.findById(id);
    if (!resource) {
      res.status(404).json({ error: 'Resource not found.' });
      return;
    }

    const inventory = await ResourceInventory.findOne({ resource: resource._id });

    res.status(200).json({
      resource,
      inventory,
    });
  } catch (error) {
    console.error('Fetch single resource error:', error);
    res.status(500).json({ error: 'Failed to retrieve resource.' });
  }
});

export default router;
