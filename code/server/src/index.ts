import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import app from './app';
import { seedDatabase } from './seed';
import { initSocketIO } from './socket';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

async function startServer(): Promise<void> {
  let uri = process.env.MONGODB_URI;

  if (!uri || uri.trim() === '') {
    console.log('[resQ Server] No MONGODB_URI configured in environment.');
    console.log('[resQ Server] Launching local in-memory MongoDB (mongodb-memory-server)...');
    
    // Dynamic import to allow running in local memory mode without cloud database
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();

    await mongoose.connect(uri);
    console.log('[resQ Server] Connected to local in-memory MongoDB.');

    console.log('[resQ Server] Auto-seeding initial demo accounts...');
    await seedDatabase();
    console.log('[resQ Server] Demo accounts ready:');
    console.log('  • Admin:             admin@resq.org / ResQSecure2026!');
    console.log('  • Volunteer:         rahul.volunteer@example.org / ResQSecure2026!');
    console.log('  • Affected Person:   amrita.devi@example.org / ResQSecure2026!');
    console.log('  • NGO:               dispatch@punjabrelief.org / ResQSecure2026!');
    console.log('  • Resource Provider: logistics@ludhianamedical.org / ResQSecure2026!');
  } else {
    console.log('[resQ Server] Connecting to MongoDB Atlas cluster...');
    await mongoose.connect(uri);
    console.log('[resQ Server] Successfully connected to remote MongoDB.');
  }

  // Create HTTP server wrapping Express application
  const httpServer = http.createServer(app);

  // Initialize self-hosted Socket.IO real-time engine
  initSocketIO(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`[resQ Server] Running on http://localhost:${PORT}`);
    console.log(`[resQ Server] Socket.IO real-time engine attached and active.`);
  });
}

startServer().catch((err: unknown) => {
  console.error('[resQ Server] Failed to start server:', err);
  process.exit(1);
});
