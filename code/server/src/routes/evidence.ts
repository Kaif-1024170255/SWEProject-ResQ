import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { Evidence, Request as RequestModel, User } from '../models';
import { JwtPayload } from '../types/auth';
import { downloadStreamFromGridFS, findGridFSFile, deleteFromGridFS } from '../services/gridfs';

const router = Router();

/**
 * Extracts and verifies JWT from either Authorization header or query parameter (for direct file links).
 */
function extractAuthUser(req: Request): JwtPayload | null {
  let token: string | null = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch (_err) {
    return null;
  }
}

/**
 * GET /api/evidence/:id/file
 * Authenticated streaming download of evidence files directly from GridFS.
 */
router.get('/:id/file', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid evidence identifier.' });
      return;
    }

    const user = extractAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required to access evidence files.' });
      return;
    }

    const evidence = await Evidence.findById(id);
    if (!evidence) {
      res.status(404).json({ error: 'Evidence attachment not found.' });
      return;
    }

    const requestDoc = await RequestModel.findById(evidence.request);
    if (!requestDoc) {
      res.status(404).json({ error: 'Associated emergency request not found.' });
      return;
    }

    // Authorization evaluation:
    // Administrators, verified responders (volunteer/ngo), original requester, and claimant
    const isAdmin = user.role === 'admin';
    const isResponder = user.role === 'volunteer' || user.role === 'ngo';
    const isRequester = requestDoc.createdBy && requestDoc.createdBy.toString() === user.userId;
    const isClaimant = requestDoc.claimedBy && requestDoc.claimedBy.toString() === user.userId;
    const isUploader = evidence.uploader && evidence.uploader.toString() === user.userId;

    if (!isAdmin && !isResponder && !isRequester && !isClaimant && !isUploader) {
      res.status(403).json({ error: 'Access denied: You are not authorized to view this evidence file.' });
      return;
    }

    // Stream from GridFS
    if (evidence.gridFsFileId) {
      const gridFile = await findGridFSFile(evidence.gridFsFileId);
      if (!gridFile) {
        res.status(404).json({ error: 'Evidence file content not found in persistent storage.' });
        return;
      }

      res.setHeader('Content-Type', evidence.fileType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.fileName)}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      if (evidence.fileSize) {
        res.setHeader('Content-Length', evidence.fileSize.toString());
      }

      const stream = downloadStreamFromGridFS(evidence.gridFsFileId);
      stream.on('error', (err) => {
        console.error('GridFS streaming error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream evidence file.' });
        }
      });
      stream.pipe(res);
      return;
    }

    // Legacy fallback: serve from local disk if available
    if (evidence.fileUrl && evidence.fileUrl.startsWith('/uploads/evidence/')) {
      const localFilename = path.basename(evidence.fileUrl);
      const localPath = path.join(process.cwd(), 'uploads', 'evidence', localFilename);
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Type', evidence.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.fileName)}"`);
        res.sendFile(localPath);
        return;
      }
    }

    res.status(404).json({ error: 'Evidence file content not found.' });
  } catch (error) {
    console.error('Retrieve evidence file error:', error);
    res.status(500).json({ error: 'Failed to retrieve evidence file.' });
  }
});

/**
 * DELETE /api/evidence/:id
 * Authenticated deletion of evidence file and metadata.
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid evidence identifier.' });
      return;
    }

    const user = extractAuthUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required to delete evidence files.' });
      return;
    }

    const evidence = await Evidence.findById(id);
    if (!evidence) {
      res.status(404).json({ error: 'Evidence attachment not found.' });
      return;
    }

    const isAdmin = user.role === 'admin';
    const isUploader = evidence.uploader && evidence.uploader.toString() === user.userId;

    if (!isAdmin && !isUploader) {
      res.status(403).json({ error: 'Access denied: Only the uploader or an administrator can delete this evidence file.' });
      return;
    }

    if (evidence.gridFsFileId) {
      await deleteFromGridFS(evidence.gridFsFileId);
    }

    await Evidence.findByIdAndDelete(evidence._id);

    res.status(200).json({
      success: true,
      message: 'Evidence attachment and persistent storage deleted successfully.',
    });
  } catch (error) {
    console.error('Delete evidence file error:', error);
    res.status(500).json({ error: 'Failed to delete evidence file.' });
  }
});

export default router;
