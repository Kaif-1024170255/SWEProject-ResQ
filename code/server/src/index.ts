import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import app from './app';
import { initSocketIO } from './socket';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

async function startServer(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    console.error('[resQ Server] FATAL: MONGODB_URI environment variable is not defined or is empty.');
    console.error('[resQ Server] Please provide a valid MongoDB connection string in your environment.');
    process.exit(1);
  }

  console.log('[resQ Server] Connecting to MongoDB Atlas cluster...');
  await mongoose.connect(uri.trim());
  console.log('[resQ Server] Successfully connected to remote MongoDB.');

  // Create HTTP server wrapping Express application
  const httpServer = http.createServer(app);

  // Initialize self-hosted Socket.IO real-time engine
  initSocketIO(httpServer);

  const HOST = process.env.HOST || '0.0.0.0';

  httpServer.listen(PORT, HOST, () => {
    console.log(`[resQ Server] Running on http://${HOST}:${PORT}`);
    console.log(`[resQ Server] Socket.IO real-time engine attached and active.`);
  });
}

startServer().catch((err: unknown) => {
  console.error('[resQ Server] Failed to start server:', err);
  process.exit(1);
});
