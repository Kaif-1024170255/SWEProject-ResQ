import bcrypt from 'bcrypt';
import { User, IUser, Request, IRequest } from './models';

export interface SeedResult {
  users: IUser[];
  requests: IRequest[];
}

/**
 * Seeds database with 5 realistic users (one per role) and sample requests
 * across every status and category to provide a rich demo experience.
 */
export async function seedDatabase(): Promise<SeedResult> {
  // Clear existing data
  await User.deleteMany({});
  await Request.deleteMany({});

  const defaultPasswordHash = await bcrypt.hash('ResQSecure2026!', 10);

  // 1. Create realistic sample users (one per role)
  const users = await User.create([
    {
      name: 'Amrita Devi',
      email: 'amrita.devi@example.org',
      passwordHash: defaultPasswordHash,
      role: 'affected_person',
    },
    {
      name: 'Rahul Sharma',
      email: 'rahul.volunteer@example.org',
      passwordHash: defaultPasswordHash,
      role: 'volunteer',
    },
    {
      name: 'Punjab Relief Network',
      email: 'dispatch@punjabrelief.org',
      passwordHash: defaultPasswordHash,
      role: 'ngo',
    },
    {
      name: 'Ludhiana Medical Supplies Depot',
      email: 'logistics@ludhianamedical.org',
      passwordHash: defaultPasswordHash,
      role: 'resource_provider',
    },
    {
      name: 'Central Dispatch Admin',
      email: 'admin@resq.org',
      passwordHash: defaultPasswordHash,
      role: 'admin',
    },
  ]);

  const [affectedPerson, volunteer, ngoUser, resourceProvider, adminUser] = users;

  const now = Date.now();

  // 2. Create sample requests across every status and category in the Ludhiana / Sector 4 region
  const requests = await Request.create([
    // --- UNVERIFIED REQUESTS (Amber pins) ---
    {
      requestId: 'REQ-2026-004821',
      category: 'medical',
      description: 'Elderly resident needs emergency insulin and cardiac medication, ground floor flooded',
      location: {
        preciseLat: 30.9010,
        preciseLng: 75.8573,
      },
      status: 'unverified',
      contactPhone: '+91 98765 43210',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 12 * 60 * 1000),
          note: 'Public emergency report logged via bystander',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004828',
      category: 'rescue',
      description: 'Three adults and an infant cut off by fast currents near canal breach, Sector 4',
      location: {
        preciseLat: 30.9150,
        preciseLng: 75.8450,
      },
      status: 'unverified',
      contactPhone: '+91 98111 22334',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 8 * 60 * 1000),
          note: 'Urgent bystander dispatch inquiry',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004832',
      category: 'supplies',
      description: 'Baby formula and clean drinking water urgently required for 8 families in community hall',
      location: {
        preciseLat: 30.8920,
        preciseLng: 75.8620,
      },
      status: 'unverified',
      contactPhone: '+91 98444 55667',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 5 * 60 * 1000),
          note: 'Reported by local neighborhood coordinator',
        },
      ],
    },

    // --- VERIFIED REQUESTS (Teal pins - ready to be claimed) ---
    {
      requestId: 'REQ-2026-004815',
      category: 'supplies',
      description: 'Clean drinking water and chlorine purification tablets needed for 12 households',
      location: {
        preciseLat: 30.9050,
        preciseLng: 75.8610,
      },
      status: 'verified',
      createdBy: affectedPerson._id,
      contactPhone: '+91 98765 11111',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 65 * 60 * 1000),
          changedBy: affectedPerson._id,
          note: 'Water supply contaminated by flood runoff',
        },
        {
          status: 'verified',
          changedAt: new Date(now - 30 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Verified with municipal water board field staff',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004808',
      category: 'rescue',
      description: 'Family stranded on two-story rooftop; boat or high-clearance truck access needed',
      location: {
        preciseLat: 30.9080,
        preciseLng: 75.8540,
      },
      status: 'verified',
      contactPhone: '+91 98123 45678',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 55 * 60 * 1000),
          note: 'Reported by neighbor with cellular coverage',
        },
        {
          status: 'verified',
          changedAt: new Date(now - 22 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Verified by district disaster response liaison',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004805',
      category: 'shelter',
      description: 'Emergency waterproof tarpaulins and dry blankets needed for 20 displaced villagers',
      location: {
        preciseLat: 30.8980,
        preciseLng: 75.8420,
      },
      status: 'verified',
      contactPhone: '+91 99000 88776',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 80 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 40 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Verified with local panchayat head',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004802',
      category: 'other',
      description: 'Fallen tree blocking ambulance route to Civil Hospital Sector 4',
      location: {
        preciseLat: 30.9120,
        preciseLng: 75.8680,
      },
      status: 'verified',
      contactPhone: '+91 97777 66554',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 70 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 35 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Traffic division notified; needs volunteer chainsaw crew',
        },
      ],
    },

    // --- IN_PROGRESS REQUESTS (Rust pins - actively being addressed) ---
    {
      requestId: 'REQ-2026-004819',
      category: 'shelter',
      description: 'Family of five displaced by flash flooding, shelter allocation underway',
      location: {
        preciseLat: 30.8985,
        preciseLng: 75.8520,
      },
      status: 'in_progress',
      createdBy: affectedPerson._id,
      claimedBy: volunteer._id,
      contactPhone: '+91 98888 77665',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 90 * 60 * 1000),
          changedBy: affectedPerson._id,
          note: 'Initial distress alert',
        },
        {
          status: 'verified',
          changedAt: new Date(now - 60 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Verified by central dispatcher',
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 25 * 60 * 1000),
          changedBy: volunteer._id,
          note: 'Volunteer Rahul Sharma en route with relocation vehicle',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004799',
      category: 'medical',
      description: 'First aid and wound dressing required for two flood-debris puncture injuries',
      location: {
        preciseLat: 30.9065,
        preciseLng: 75.8710,
      },
      status: 'in_progress',
      claimedBy: ngoUser._id,
      contactPhone: '+91 98555 44332',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 110 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 75 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 35 * 60 * 1000),
          changedBy: ngoUser._id,
          note: 'Punjab Relief Network mobile paramedic team dispatched',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004795',
      category: 'supplies',
      description: 'Dry rations, rice, and lentils for 40 people accommodated at Gurdwara relief camp',
      location: {
        preciseLat: 30.8890,
        preciseLng: 75.8500,
      },
      status: 'in_progress',
      claimedBy: resourceProvider._id,
      contactPhone: '+91 99111 33221',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 130 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 90 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 45 * 60 * 1000),
          changedBy: resourceProvider._id,
          note: 'Ludhiana Medical Supplies Depot loading supply truck',
        },
      ],
    },

    // --- RESOLVED REQUESTS (Teal pins - pending requester confirm) ---
    {
      requestId: 'REQ-2026-004792',
      category: 'supplies',
      description: 'Emergency 15kVA diesel generator delivered and connected for community health clinic',
      location: {
        preciseLat: 30.8950,
        preciseLng: 75.8650,
      },
      status: 'resolved',
      claimedBy: resourceProvider._id,
      contactPhone: '+91 98777 00112',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 180 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 140 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 90 * 60 * 1000),
          changedBy: resourceProvider._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 15 * 60 * 1000),
          changedBy: resourceProvider._id,
          note: 'Generator delivered, fuel topped up, refrigeration running. Awaiting clinic staff confirmation.',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004788',
      category: 'medical',
      description: 'Asthma inhalers and pediatric oral rehydration packets delivered to relief camp',
      location: {
        preciseLat: 30.9180,
        preciseLng: 75.8590,
      },
      status: 'resolved',
      claimedBy: volunteer._id,
      contactPhone: '+91 98666 55443',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 210 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 170 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 110 * 60 * 1000),
          changedBy: volunteer._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 20 * 60 * 1000),
          changedBy: volunteer._id,
          note: 'Supplies handed over to camp lead Dr. Balwant',
        },
      ],
    },

    // --- CLOSED ARCHIVED REQUESTS (Archived from map, visible in track history) ---
    {
      requestId: 'REQ-2026-004770',
      category: 'other',
      description: 'Downed power line blocking main access road to Sector 4 temporary shelter',
      location: {
        preciseLat: 30.9025,
        preciseLng: 75.8480,
      },
      status: 'closed',
      contactPhone: '+91 98111 00998',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 300 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 250 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 200 * 60 * 1000),
          changedBy: volunteer._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 150 * 60 * 1000),
          changedBy: volunteer._id,
          note: 'Power line isolated and secured by state electricity squad',
        },
        {
          status: 'closed',
          changedAt: new Date(now - 120 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Road clearance verified and access restored',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004762',
      category: 'rescue',
      description: 'Boat rescue of 6 residents stranded near bus terminal low ground',
      location: {
        preciseLat: 30.8970,
        preciseLng: 75.8690,
      },
      status: 'closed',
      contactPhone: '+91 98222 33445',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 360 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 310 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 240 * 60 * 1000),
          changedBy: ngoUser._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 180 * 60 * 1000),
          changedBy: ngoUser._id,
          note: 'All six residents evacuated safely to community center',
        },
        {
          status: 'closed',
          changedAt: new Date(now - 140 * 60 * 1000),
          note: 'Requester confirmed safe arrival at shelter',
        },
      ],
    },
  ]);

  return { users, requests };
}
