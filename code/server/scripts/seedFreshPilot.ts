import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedDatabase } from '../src/seed';

dotenv.config();

async function runFreshPilotSeed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is required to run the seed script.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected. Running fresh pilot database reset...');

    const {
      users,
      requests,
      organizations = [],
      resources = [],
      inventories = [],
      categories = [],
    } = await seedDatabase({ freshPilot: true });

    console.log(`\n======================================================`);
    console.log(`PRE-PILOT STAGING COMPLETE: FRESH SEED RESET APPLIED`);
    console.log(`======================================================`);
    console.log(` • ${users.length} core persona accounts seeded (1 per role)`);
    console.log(` • ${organizations.length} organizations linked and verified`);
    console.log(` • ${resources.length} registered relief resources ready`);
    console.log(` • ${inventories.length} depot inventory records available`);
    console.log(` • ${categories.length} emergency categories ready`);
    console.log(` • ${requests.length} active/historical requests (Clean slate: 0 requests)`);
    console.log(`\nAll 5 accounts ready with password: ResQSecure2026!`);
    console.log(` - Affected Person:    amrita.devi@example.org`);
    console.log(` - Volunteer:          rahul.volunteer@example.org`);
    console.log(` - NGO Coordinator:    dispatch@punjabrelief.org`);
    console.log(` - Resource Provider:  logistics@ludhianamedical.org`);
    console.log(` - Central Admin:      admin@resq.org`);
    console.log(`======================================================\n`);
  } catch (error) {
    console.error('Error seeding fresh pilot database:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

runFreshPilotSeed();
