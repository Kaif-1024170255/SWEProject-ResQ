import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedDatabase } from '../src/seed';

dotenv.config();

async function runSeed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is required to run the standalone seed script.');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected. Running database seed...');

    const {
      users,
      requests,
      organizations = [],
      resources = [],
      inventories = [],
      verifications = [],
      categories = [],
      notifications = [],
      messages = [],
      evidence = [],
      incidents = [],
    } = await seedDatabase();

    console.log(`\nSuccessfully seeded:`);
    console.log(` • ${users.length} users (Admin, Volunteer, Affected Person, NGO, Resource Provider)`);
    console.log(` • ${requests.length} realistic requests across all categories and statuses`);
    console.log(` • ${organizations.length} organizations (NGO, Supplier, Hospital, Government, Community Group)`);
    console.log(` • ${categories.length} custom and default emergency categories`);
    console.log(` • ${resources.length} registered resources`);
    console.log(` • ${inventories.length} resource inventory records`);
    console.log(` • ${verifications.length} verified inspection records`);
    console.log(` • ${notifications.length} in-app notifications`);
    console.log(` • ${messages.length} request communication messages`);
    console.log(` • ${evidence.length} supporting evidence attachments`);
    console.log(` • ${incidents.length} major emergency incident groupings`);

    console.log('\nDemo User Credentials:');
    users.forEach((u) => {
      console.log(` • [${u.role.toUpperCase()}]: ${u.email} / ResQSecure2026!`);
    });

    await mongoose.disconnect();
    console.log('\nDatabase seeding complete.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed database:', error);
    process.exit(1);
  }
}

runSeed();
