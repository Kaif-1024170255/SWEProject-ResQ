import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ResourceInventory } from '../models';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// 1. GET /api/inventory - View current inventory with optional filters
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = {};

    if (req.query.organizationId && typeof req.query.organizationId === 'string') {
      if (mongoose.isValidObjectId(req.query.organizationId)) {
        filter.organization = req.query.organizationId;
      }
    }

    if (req.query.resourceId && typeof req.query.resourceId === 'string') {
      if (mongoose.isValidObjectId(req.query.resourceId)) {
        filter.resource = req.query.resourceId;
      }
    }

    if (req.query.ownerId && typeof req.query.ownerId === 'string') {
      if (mongoose.isValidObjectId(req.query.ownerId)) {
        filter.ownerId = req.query.ownerId;
      }
    }

    if (req.query.status && typeof req.query.status === 'string') {
      filter.status = req.query.status;
    }

    const inventory = await ResourceInventory.find(filter)
      .populate('resource', 'name category unit description isPerishable')
      .populate('organization', 'name type operatingRegion')
      .sort({ createdAt: -1 });

    res.status(200).json({ inventory });
  } catch (error) {
    console.error('Fetch inventory error:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory.' });
  }
});

// 2. GET /api/inventory/:id - View single inventory item
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid inventory ID format.' });
      return;
    }

    const item = await ResourceInventory.findById(id)
      .populate('resource', 'name category unit description isPerishable')
      .populate('organization', 'name type operatingRegion');

    if (!item) {
      res.status(404).json({ error: 'Inventory item not found.' });
      return;
    }

    res.status(200).json({ inventory: item });
  } catch (error) {
    console.error('Fetch single inventory item error:', error);
    res.status(500).json({ error: 'Failed to retrieve inventory item.' });
  }
});

// 3. POST /api/inventory/:id/reserve - Reserve a specific quantity of inventory
router.post(
  '/:id/reserve',
  requireAuth,
  requireRole('resource_provider', 'ngo', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid inventory ID format.' });
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({ error: 'Reservation quantity must be a positive number.' });
      return;
    }

    const inventory = await ResourceInventory.findById(id);
    if (!inventory) {
      res.status(404).json({ error: 'Inventory item not found.' });
      return;
    }

    try {
      await inventory.reserve(qty);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to reserve inventory.' });
      return;
    }

    await inventory.populate('resource', 'name category unit');
    if (inventory.organization) {
      await inventory.populate('organization', 'name type');
    }

    res.status(200).json({
      message: `Successfully reserved ${qty} unit(s).`,
      inventory,
    });
  } catch (error) {
    console.error('Reserve inventory error:', error);
    res.status(500).json({ error: 'Failed to reserve inventory.' });
  }
});

// 4. POST /api/inventory/:id/release - Release a specific reserved quantity back to available
router.post(
  '/:id/release',
  requireAuth,
  requireRole('resource_provider', 'ngo', 'admin'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid inventory ID format.' });
      return;
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({ error: 'Release quantity must be a positive number.' });
      return;
    }

    const inventory = await ResourceInventory.findById(id);
    if (!inventory) {
      res.status(404).json({ error: 'Inventory item not found.' });
      return;
    }

    try {
      await inventory.release(qty);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to release inventory.' });
      return;
    }

    await inventory.populate('resource', 'name category unit');
    if (inventory.organization) {
      await inventory.populate('organization', 'name type');
    }

    res.status(200).json({
      message: `Successfully released ${qty} unit(s) back to available inventory.`,
      inventory,
    });
  } catch (error) {
    console.error('Release inventory error:', error);
    res.status(500).json({ error: 'Failed to release inventory.' });
  }
});

export default router;
