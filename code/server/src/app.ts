import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import authRouter from './routes/auth';
import requestsRouter from './routes/requests';
import { requireAuth, requireRole } from './middleware/auth';

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Emergency Request routes
app.use('/api/requests', requestsRouter);

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
