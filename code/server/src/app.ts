import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import jwt from 'jsonwebtoken';
import authRouter from './routes/auth';
import requestsRouter from './routes/requests';
import organizationsRouter from './routes/organizations';
import resourcesRouter from './routes/resources';
import inventoryRouter from './routes/inventory';
import notificationsRouter from './routes/notifications';
import categoriesRouter from './routes/categories';
import incidentsRouter from './routes/incidents';
import analyticsRouter from './routes/analytics';
import classificationRouter from './routes/classification';
import geocodeRouter from './routes/geocode';
import evidenceRouter from './routes/evidence';
import { Evidence, Request as RequestModel } from './models';
import { findGridFSFile, downloadStreamFromGridFS } from './services/gridfs';
import { requireAuth, requireRole } from './middleware/auth';

const app: Application = express();

// Middleware
// Configure CORS for local development and deployed frontend origin (strictly explicit origins with credentials)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, mobile, curl, health probes)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Explicit matching against allowed origins list (no wildcards with credentials)
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, normalizedOrigin);
    }

    // In local development or automated tests, permit localhost/127.0.0.1 explicitly
    if (
      process.env.NODE_ENV !== 'production' &&
      (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'))
    ) {
      return callback(null, normalizedOrigin);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Backward-compatibility streaming for /uploads/evidence/:filename from GridFS with authorization check
app.get('/uploads/evidence/:filename', async (req: Request, res: Response, next) => {
  try {
    const rawFilename = req.params.filename;
    const filename = Array.isArray(rawFilename) ? rawFilename[0] : rawFilename;
    const evidence = await Evidence.findOne({
      $or: [
        { storageKey: filename },
        { fileUrl: `/uploads/evidence/${filename}` },
      ],
    });

    if (evidence && evidence.gridFsFileId) {
      // Authorization verification for protected evidence files
      if (evidence.request) {
        const authHeader = req.headers.authorization;
        const queryToken = req.query.token as string | undefined;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken;

        let user: any = null;
        if (token && process.env.JWT_SECRET) {
          try {
            user = jwt.verify(token, process.env.JWT_SECRET);
          } catch (_err) {}
        }

        const requestDoc = await RequestModel.findById(evidence.request);
        if (requestDoc && (requestDoc.createdBy || requestDoc.claimedBy)) {
          const isAdmin = user && user.role === 'admin';
          const isResponder = user && (user.role === 'volunteer' || user.role === 'ngo');
          const isRequester = user && requestDoc.createdBy && requestDoc.createdBy.toString() === user.userId;
          const isClaimant = user && requestDoc.claimedBy && requestDoc.claimedBy.toString() === user.userId;
          const isUploader = user && evidence.uploader && evidence.uploader.toString() === user.userId;

          if (!isAdmin && !isResponder && !isRequester && !isClaimant && !isUploader) {
            res.status(403).json({ error: 'Access denied: You are not authorized to view this evidence file.' });
            return;
          }
        }
      }

      const gridFile = await findGridFSFile(evidence.gridFsFileId);
      if (gridFile) {
        res.setHeader('Content-Type', evidence.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(evidence.fileName)}"`);
        downloadStreamFromGridFS(evidence.gridFsFileId).pipe(res);
        return;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Static file serving fallback for local uploads (if present)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Emergency Request routes
app.use('/api/requests', requestsRouter);

// Evidence routes (GridFS persistent streaming and deletion)
app.use('/api/evidence', evidenceRouter);

// Organization, Resource, and Inventory routes
app.use('/api/organizations', organizationsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/inventory', inventoryRouter);

// Notification routes
app.use('/api/notifications', notificationsRouter);

// Category and Incident routes
app.use('/api/categories', categoriesRouter);
app.use('/api/incidents', incidentsRouter);

// Analytics platform metrics route
app.use('/api/analytics', analyticsRouter);

// AI classification suggestion route
app.use('/api/classification', classificationRouter);

// Geocoding proxy route (OSM Nominatim)
app.use('/api/geocode', geocodeRouter);

// Role-protected route example for administrative overview
app.get(
  '/api/admin/overview',
  requireAuth,
  requireRole('admin'),
  (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      message: 'Welcome to the Admin Operations Console',
    });
  }
);

export default app;
