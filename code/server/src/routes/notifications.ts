import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Notification } from '../models';
import { requireAuth } from '../middleware/auth';

const router = Router();

// 1. GET /api/notifications - List notifications for the authenticated user
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const filter: Record<string, any> = {
      recipient: new mongoose.Types.ObjectId(userId),
    };

    if (req.query.unreadOnly === 'true') {
      filter.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('request', 'requestId category status location.publicLat location.publicLng')
        .sort({ createdAt: -1 })
        .limit(50),
      Notification.countDocuments({
        recipient: new mongoose.Types.ObjectId(userId),
        isRead: false,
      }),
    ]);

    res.status(200).json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// 2. PATCH /api/notifications/:id/read - Mark a single notification as read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid notification ID format.' });
      return;
    }

    const notification = await Notification.findOne({
      _id: id,
      recipient: new mongoose.Types.ObjectId(userId),
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// 3. PATCH /api/notifications/read-all - Mark all unread notifications as read
router.patch('/read-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const result = await Notification.updateMany(
      {
        recipient: new mongoose.Types.ObjectId(userId),
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.status(200).json({
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
});

export default router;
