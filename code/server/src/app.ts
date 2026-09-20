import dotenv from 'dotenv';
dotenv.config();

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
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
import { requireAuth, requireRole } from './middleware/auth';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static file serving for local evidence uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Emergency Request routes
app.use('/api/requests', requestsRouter);

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
