import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Organization, ORGANIZATION_TYPES, OrganizationType, User } from '../models';
import { requireAuth } from '../middleware/auth';

const router = Router();

// 1. POST /api/organizations - Create a new Organization (Authenticated users)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      type,
      registrationNumber,
      contactEmail,
      contactPhone,
      operatingRegion,
      address,
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Organization name is required.' });
      return;
    }

    const orgType: OrganizationType = type || 'ngo';
    if (!ORGANIZATION_TYPES.includes(orgType)) {
      res.status(400).json({
        error: `Invalid organization type '${type}'. Must be one of: ${ORGANIZATION_TYPES.join(', ')}.`,
      });
      return;
    }

    // Check if authenticated user already has an organization registered as primary contact
    const userOrg = req.user
      ? await Organization.findOne({ primaryContact: req.user.userId })
      : null;

    if (userOrg) {
      // User is updating their own organization details
      const nameConflict = await Organization.findOne({
        name: name.trim(),
        _id: { $ne: userOrg._id },
      });
      if (nameConflict) {
        res.status(400).json({ error: 'An organization with this name already exists.' });
        return;
      }

      userOrg.name = name.trim();
      userOrg.type = orgType;
      if (registrationNumber !== undefined) {
        userOrg.registrationNumber = registrationNumber ? String(registrationNumber).trim() : undefined;
      }
      if (contactEmail !== undefined) {
        userOrg.contactEmail = contactEmail ? String(contactEmail).trim().toLowerCase() : undefined;
      }
      if (contactPhone !== undefined) {
        userOrg.contactPhone = contactPhone ? String(contactPhone).trim() : undefined;
      }
      if (operatingRegion !== undefined) {
        userOrg.operatingRegion = operatingRegion ? String(operatingRegion).trim() : undefined;
      }
      if (address !== undefined) {
        userOrg.address = address ? String(address).trim() : undefined;
      }

      await userOrg.save();

      res.status(200).json({
        message: 'Organization updated successfully',
        organization: userOrg,
      });
      return;
    }

    const existing = await Organization.findOne({ name: name.trim() });
    if (existing) {
      res.status(400).json({ error: 'An organization with this name already exists.' });
      return;
    }

    const organization = new Organization({
      name: name.trim(),
      type: orgType,
      registrationNumber: registrationNumber ? String(registrationNumber).trim() : undefined,
      contactEmail: contactEmail ? String(contactEmail).trim().toLowerCase() : undefined,
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      operatingRegion: operatingRegion ? String(operatingRegion).trim() : undefined,
      address: address ? String(address).trim() : undefined,
      primaryContact: req.user ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
    });

    await organization.save();

    // Link organization to user if user does not already have an organization assigned
    if (req.user) {
      const user = await User.findById(req.user.userId);
      if (user && !user.organizationId) {
        user.organizationId = organization._id as mongoose.Types.ObjectId;
        await user.save();
      }
    }

    res.status(201).json({
      message: 'Organization created successfully',
      organization,
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization.' });
  }
});

// 2. GET /api/organizations - List organizations with optional filters
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: Record<string, any> = {};

    if (req.query.type && typeof req.query.type === 'string') {
      if (ORGANIZATION_TYPES.includes(req.query.type as OrganizationType)) {
        filter.type = req.query.type;
      }
    }

    if (req.query.operatingRegion && typeof req.query.operatingRegion === 'string') {
      filter.operatingRegion = new RegExp(req.query.operatingRegion, 'i');
    }

    const organizations = await Organization.find(filter)
      .populate('primaryContact', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({ organizations });
  } catch (error) {
    console.error('Fetch organizations error:', error);
    res.status(500).json({ error: 'Failed to retrieve organizations.' });
  }
});

// 3. GET /api/organizations/:id - Get single organization by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid organization ID format.' });
      return;
    }

    const organization = await Organization.findById(id).populate(
      'primaryContact',
      'name email role'
    );

    if (!organization) {
      res.status(404).json({ error: 'Organization not found.' });
      return;
    }

    res.status(200).json({ organization });
  } catch (error) {
    console.error('Fetch single organization error:', error);
    res.status(500).json({ error: 'Failed to retrieve organization.' });
  }
});

export default router;
