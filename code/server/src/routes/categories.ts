import { Router, Request, Response } from 'express';
import { EmergencyCategory, seedDefaultCategories } from '../models';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// 1. GET /api/categories - View categories
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Ensure default categories exist
    const count = await EmergencyCategory.countDocuments();
    if (count === 0) {
      await seedDefaultCategories();
    }

    const { all } = req.query;
    const filter = all === 'true' ? {} : { isActive: true };

    const categories = await EmergencyCategory.find(filter).sort({ priority_level: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error('Fetch categories error:', error);
    res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

// 2. POST /api/categories - Admin creates a new category
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, label, description, priority_level } = req.body;

      if (!name || !label || !description) {
        res.status(400).json({ error: 'Category name, label, and description are required.' });
        return;
      }

      const normalizedName = String(name).trim().toLowerCase().replace(/\s+/g, '_');

      const existing = await EmergencyCategory.findOne({ name: normalizedName });
      if (existing) {
        res.status(409).json({ error: `Category '${normalizedName}' already exists.` });
        return;
      }

      const category = await EmergencyCategory.create({
        name: normalizedName,
        label: String(label).trim(),
        description: String(description).trim(),
        priority_level: priority_level || 'medium',
        isActive: true,
      });

      res.status(201).json({
        success: true,
        category,
      });
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({ error: 'Failed to create emergency category.' });
    }
  }
);

// 3. PATCH /api/categories/:id - Admin updates a category
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { label, description, priority_level, isActive } = req.body;

      const category = await EmergencyCategory.findById(id);
      if (!category) {
        res.status(404).json({ error: 'Category not found.' });
        return;
      }

      if (label !== undefined) category.label = String(label).trim();
      if (description !== undefined) category.description = String(description).trim();
      if (priority_level !== undefined) category.priority_level = priority_level;
      if (isActive !== undefined) category.isActive = Boolean(isActive);

      await category.save();

      res.status(200).json({
        success: true,
        category,
      });
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({ error: 'Failed to update emergency category.' });
    }
  }
);

export default router;
