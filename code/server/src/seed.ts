import bcrypt from 'bcrypt';
import {
  User,
  IUser,
  Request,
  IRequest,
  Organization,
  Resource,
  ResourceInventory,
  RequestResource,
  RequestAssignment,
  Verification,
  Notification,
  Message,
  Evidence,
  Incident,
  EmergencyCategory,
  seedDefaultCategories,
} from './models';
import { recordTelemetrySample } from './socket';

export interface SeedResult {
  users: IUser[];
  requests: IRequest[];
  organizations?: any[];
  resources?: any[];
  inventories?: any[];
  verifications?: any[];
  categories?: any[];
  incidents?: any[];
  notifications?: any[];
  messages?: any[];
  evidence?: any[];
}

/**
 * Seeds database with realistic users, organizations, resources, requests,
 * assignments, verifications, notifications, messages, and incidents
 * to provide a comprehensive, production-grade operations demo.
 */
export async function seedDatabase(options?: { freshPilot?: boolean }): Promise<SeedResult> {
  // Clear existing data across all collections
  await User.deleteMany({});
  await Request.deleteMany({});
  await Organization.deleteMany({});
  await Resource.deleteMany({});
  await ResourceInventory.deleteMany({});
  await RequestResource.deleteMany({});
  await RequestAssignment.deleteMany({});
  await Verification.deleteMany({});
  await Notification.deleteMany({});
  await Message.deleteMany({});
  await Evidence.deleteMany({});
  await Incident.deleteMany({});
  await EmergencyCategory.deleteMany({});

  // Seed default emergency categories
  await seedDefaultCategories();

  // Seed custom emergency categories (demonstrating dynamic admin category management)
  const customCategories = await EmergencyCategory.create([
    {
      name: 'power_grid',
      label: 'Power & Grid Utilities',
      description: 'Downed power lines, substation blackout, and critical backup power needs',
      priority_level: 'high',
      isActive: true,
    },
    {
      name: 'comms_radio',
      label: 'Communications & Radio Support',
      description: 'Cellular network blackouts, satellite phone staging, HAM radio links',
      priority_level: 'medium',
      isActive: true,
    },
    {
      name: 'hazmat_containment',
      label: 'Hazardous Materials Containment',
      description: 'Chemical leakage, industrial runoff, and toxic gas monitoring',
      priority_level: 'critical',
      isActive: false, // Inactive category demonstrating admin reactivation
    },
  ]);

  const defaultPasswordHash = await bcrypt.hash('ResQSecure2026!', 10);

  // 1. Create realistic sample users (one per role)
  const users = await User.create([
    {
      name: 'Amrita Devi',
      email: 'amrita.devi@example.org',
      passwordHash: defaultPasswordHash,
      role: 'affected_person',
      location: {
        address: 'House 42, Ward 7, Sector 4, Ludhiana',
        lat: 30.9082,
        lng: 75.8542,
      },
    },
    {
      name: 'Rahul Sharma',
      email: 'rahul.volunteer@example.org',
      passwordHash: defaultPasswordHash,
      role: 'volunteer',
      location: {
        address: 'Sector 4 Civil Lines, Ludhiana',
        lat: 30.9090,
        lng: 75.8530,
      },
      skills: ['rescue', 'boat_operation', 'first_aid', 'supplies', 'shelter'],
      availability: {
        status: 'available',
        startHour: 0,
        endHour: 23,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    },
    {
      name: 'Punjab Relief Network',
      email: 'dispatch@punjabrelief.org',
      passwordHash: defaultPasswordHash,
      role: 'ngo',
      location: {
        address: '14 Civil Lines, Ludhiana, Punjab 141001',
        lat: 30.9020,
        lng: 75.8510,
      },
      skills: ['rescue', 'medical', 'shelter', 'supplies', 'evacuation'],
      availability: {
        status: 'available',
        startHour: 0,
        endHour: 23,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    },
    {
      name: 'Ludhiana Medical Supplies Depot',
      email: 'logistics@ludhianamedical.org',
      passwordHash: defaultPasswordHash,
      role: 'resource_provider',
      location: {
        address: '88 Industrial Area B, Ludhiana, Punjab 141003',
        lat: 30.8900,
        lng: 75.8600,
      },
      skills: ['medical', 'supplies', 'logistics', 'pharmaceuticals'],
      availability: {
        status: 'available',
        startHour: 0,
        endHour: 23,
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
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
  const requests = options?.freshPilot
    ? []
    : await Request.create([
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
    {
      requestId: 'REQ-2026-004750',
      category: 'supplies',
      description: 'Reported water supply outage at Sector 4 community center',
      location: {
        preciseLat: 30.8922,
        preciseLng: 75.8621,
      },
      status: 'closed',
      contactPhone: '+91 98999 11223',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 45 * 60 * 1000),
          note: 'Caller reported water outage',
        },
        {
          status: 'closed',
          changedAt: new Date(now - 15 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Request closed during verification: duplicate with REQ-2026-004832',
        },
      ],
    },

    // --- CANCELLED / WITHDRAWN REQUESTS (Visible in audit & track history) ---
    {
      requestId: 'REQ-2026-004755',
      category: 'shelter',
      description: 'Emergency tarp and temporary bedding withdrawn after safe family relocation',
      location: {
        preciseLat: 30.9120,
        preciseLng: 75.8420,
      },
      status: 'cancelled',
      createdBy: affectedPerson._id,
      contactPhone: '+91 98333 44556',
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 140 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 100 * 60 * 1000),
          changedBy: adminUser._id,
          note: 'Verified requirement with household head',
        },
        {
          status: 'cancelled',
          changedAt: new Date(now - 40 * 60 * 1000),
          changedBy: affectedPerson._id,
          note: 'Withdrawn by requester: Evacuated safely with neighbors to dry area, shelter supplies no longer needed',
        },
      ],
    },

    // --- HISTORICAL 7-DAY OPERATIONAL DATA (For proposal analytics metrics) ---
    {
      requestId: 'REQ-2026-004601',
      category: 'medical',
      description: 'Dialysis patient transfer from waterlogged ground floor clinic, Sector 3',
      location: {
        preciseLat: 30.9040,
        preciseLng: 75.8590,
      },
      status: 'closed',
      contactPhone: '+91 98721 11223',
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 120 * 60 * 1000),
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 120 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 80 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 50 * 60 * 1000), // 30 min time-to-match
          changedBy: ngoUser._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 20 * 60 * 1000),
          changedBy: ngoUser._id,
        },
        {
          status: 'closed',
          changedAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000),
          note: 'Requester confirmed hospital arrival',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004602',
      category: 'supplies',
      description: 'Infant nutritional kits and water canisters for flood relief shelter, Sector 5',
      location: {
        preciseLat: 30.8960,
        preciseLng: 75.8480,
      },
      status: 'closed',
      contactPhone: '+91 98722 33445',
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 150 * 60 * 1000),
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 150 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 110 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 68 * 60 * 1000), // 42 min time-to-match
          changedBy: resourceProvider._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000),
          changedBy: resourceProvider._id,
        },
        {
          status: 'closed',
          changedAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000),
          note: 'Shelter coordinator confirmed receipt',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004603',
      category: 'rescue',
      description: 'Elderly couple unable to evacuate ground floor apartment due to rising street water',
      location: {
        preciseLat: 30.9110,
        preciseLng: 75.8620,
      },
      status: 'resolved',
      contactPhone: '+91 98723 55667',
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 180 * 60 * 1000),
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 180 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 140 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 116 * 60 * 1000), // 24 min time-to-match
          changedBy: volunteer._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 45 * 60 * 1000),
          changedBy: volunteer._id,
          note: 'Couple evacuated safely to second floor community wing. Awaiting confirmation.',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004604',
      category: 'shelter',
      description: 'Emergency tarpaulin rolls for damaged community center roof, Sector 4',
      location: {
        preciseLat: 30.9030,
        preciseLng: 75.8520,
      },
      status: 'closed',
      contactPhone: '+91 98724 77889',
      createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 200 * 60 * 1000),
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 200 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 160 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 124 * 60 * 1000), // 36 min time-to-match
          changedBy: volunteer._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 50 * 60 * 1000),
          changedBy: volunteer._id,
        },
        {
          status: 'closed',
          changedAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 15 * 60 * 1000),
          note: 'Roof secured; volunteer verified with resident committee',
        },
      ],
    },
    {
      requestId: 'REQ-2026-004605',
      category: 'medical',
      description: 'Emergency insulin pack dispatch for stranded diabetic patient, Sector 6',
      location: {
        preciseLat: 30.8990,
        preciseLng: 75.8670,
      },
      status: 'closed',
      contactPhone: '+91 98725 99001',
      createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 220 * 60 * 1000),
      statusHistory: [
        {
          status: 'unverified',
          changedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 220 * 60 * 1000),
        },
        {
          status: 'verified',
          changedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 180 * 60 * 1000),
          changedBy: adminUser._id,
        },
        {
          status: 'in_progress',
          changedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 162 * 60 * 1000), // 18 min time-to-match
          changedBy: ngoUser._id,
        },
        {
          status: 'resolved',
          changedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 70 * 60 * 1000),
          changedBy: ngoUser._id,
        },
        {
          status: 'closed',
          changedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 - 25 * 60 * 1000),
          note: 'Family confirmed insulin delivered safely',
        },
      ],
    },
  ]);

  // 3. Create Organizations
  const punjabRelief = await Organization.create({
    name: 'Punjab Relief Network',
    type: 'ngo',
    registrationNumber: 'NGO-PB-2024-8841',
    contactEmail: 'dispatch@punjabrelief.org',
    contactPhone: '+91 98765 22001',
    operatingRegion: 'Ludhiana Central',
    address: '14 Civil Lines, Ludhiana, Punjab 141001',
    isVerified: true,
    primaryContact: ngoUser._id,
  });

  const medicalDepot = await Organization.create({
    name: 'Ludhiana Medical Supplies Depot',
    type: 'supplier',
    registrationNumber: 'SUP-PB-2023-1102',
    contactEmail: 'logistics@ludhianamedical.org',
    contactPhone: '+91 98765 22002',
    operatingRegion: 'Punjab North',
    address: '88 Industrial Area B, Ludhiana, Punjab 141003',
    isVerified: true,
    primaryContact: resourceProvider._id,
  });

  const sutlejSociety = await Organization.create({
    name: 'Sutlej Disaster Response Society',
    type: 'community_group',
    registrationNumber: 'CG-PB-2025-9921',
    contactEmail: 'contact@sutlejresponse.org',
    contactPhone: '+91 98765 22003',
    operatingRegion: 'Ludhiana Sector 4',
    address: 'Community Center, Sector 4, Ludhiana, Punjab 141004',
    isVerified: true,
    primaryContact: volunteer._id,
  });

  const civilHospital = await Organization.create({
    name: 'Civil Hospital Ludhiana Emergency Wing',
    type: 'hospital',
    registrationNumber: 'HOSP-PB-2022-0045',
    contactEmail: 'emergency@civilhospital-ludhiana.org',
    contactPhone: '+91 98765 22004',
    operatingRegion: 'Ludhiana North',
    address: 'Mall Road, Civil Lines, Ludhiana, Punjab 141001',
    isVerified: true,
  });

  const civilDefense = await Organization.create({
    name: 'Punjab State Civil Defense Directorate',
    type: 'government',
    registrationNumber: 'GOV-PB-CIVIL-DEF-01',
    contactEmail: 'operations@civildefense.punjab.gov.in',
    contactPhone: '+91 98765 22005',
    operatingRegion: 'Punjab Central Corridor',
    address: 'Civil Secretariat Complex, Chandigarh / Ludhiana Liaison',
    isVerified: true,
  });

  const organizations = [punjabRelief, medicalDepot, sutlejSociety, civilHospital, civilDefense];

  // Associate users with their organizations
  await User.findByIdAndUpdate(ngoUser._id, { organizationId: punjabRelief._id });
  await User.findByIdAndUpdate(resourceProvider._id, { organizationId: medicalDepot._id });
  await User.findByIdAndUpdate(volunteer._id, { organizationId: sutlejSociety._id });

  // 4. Create Resources & ResourceInventory
  const resRaft = await Resource.create({
    name: 'Inflatable Rescue Raft (6-Person)',
    category: 'rescue',
    unit: 'boats',
    ownerType: 'Organization',
    ownerId: punjabRelief._id,
  });

  const resMedKit = await Resource.create({
    name: 'Emergency Trauma & First Aid Kit',
    category: 'medical',
    unit: 'kits',
    ownerType: 'Organization',
    ownerId: medicalDepot._id,
  });

  const resWaterFilter = await Resource.create({
    name: 'High-Capacity Potable Water Filtration Unit',
    category: 'supplies',
    unit: 'units',
    ownerType: 'Organization',
    ownerId: punjabRelief._id,
  });

  const resGenerator = await Resource.create({
    name: '5kVA Silent Diesel Generator',
    category: 'supplies',
    unit: 'units',
    ownerType: 'Organization',
    ownerId: sutlejSociety._id,
  });

  const resources = [resRaft, resMedKit, resWaterFilter, resGenerator];

  const inventories = await ResourceInventory.create([
    {
      resource: resRaft._id,
      organization: punjabRelief._id,
      ownerType: 'Organization',
      ownerId: punjabRelief._id,
      quantityAvailable: 4,
      quantityReserved: 1,
      location: {
        address: 'Sector 4 Boat Launch Staging Ground',
        lat: 30.9100,
        lng: 75.8500,
      },
    },
    {
      resource: resMedKit._id,
      organization: medicalDepot._id,
      ownerType: 'Organization',
      ownerId: medicalDepot._id,
      quantityAvailable: 45,
      quantityReserved: 5,
      location: {
        address: 'Central Pharmacy Warehouse Depot',
        lat: 30.8900,
        lng: 75.8600,
      },
    },
    {
      resource: resWaterFilter._id,
      organization: punjabRelief._id,
      ownerType: 'Organization',
      ownerId: punjabRelief._id,
      quantityAvailable: 8,
      quantityReserved: 2,
      location: {
        address: 'Punjab Relief Logistics Base',
        lat: 30.9000,
        lng: 75.8500,
      },
    },
    {
      resource: resGenerator._id,
      organization: sutlejSociety._id,
      ownerType: 'Organization',
      ownerId: sutlejSociety._id,
      quantityAvailable: 2,
      quantityReserved: 0,
      location: {
        address: 'Sector 4 Community Depot',
        lat: 30.9050,
        lng: 75.8550,
      },
    },
  ]);

  if (options?.freshPilot) {
    // Record baseline telemetry samples so Socket.IO latency shows active non-null reading
    recordTelemetrySample(14);
    recordTelemetrySample(11);
    recordTelemetrySample(18);
    recordTelemetrySample(22);

    return {
      users,
      requests: [],
      organizations,
      resources,
      inventories,
      verifications: [],
      categories: customCategories,
      notifications: [],
      messages: [],
      evidence: [],
      incidents: [],
    };
  }

  // Find requests for linking
  const reqRooftop = requests.find((r) => r.requestId === 'REQ-2026-004808')!;
  const reqWater = requests.find((r) => r.requestId === 'REQ-2026-004815')!;
  const reqRescueActive = requests.find((r) => r.requestId === 'REQ-2026-004795')!;
  const reqMedicalActive = requests.find((r) => r.requestId === 'REQ-2026-004788')!;
  const reqUnverified1 = requests.find((r) => r.requestId === 'REQ-2026-004821')!;
  const reqUnverified2 = requests.find((r) => r.requestId === 'REQ-2026-004828')!;
  const reqDuplicate = requests.find((r) => r.requestId === 'REQ-2026-004750')!;

  // 5. Create RequestResource requirements & RequestAssignments
  await RequestResource.create([
    {
      request: reqRooftop._id,
      resource: resRaft._id,
      quantityRequested: 1,
      quantityAllocated: 1,
      status: 'fully_allocated',
    },
    {
      request: reqMedicalActive._id,
      resource: resMedKit._id,
      quantityRequested: 2,
      quantityAllocated: 1,
      status: 'partially_allocated',
    },
    {
      request: reqWater._id,
      resource: resWaterFilter._id,
      quantityRequested: 4,
      quantityAllocated: 2,
      status: 'partially_allocated',
    },
    {
      request: reqWater._id,
      resource: resMedKit._id,
      quantityRequested: 6,
      quantityAllocated: 3,
      status: 'partially_allocated',
    },
  ]);

  await RequestAssignment.create([
    {
      request: reqRooftop._id,
      assignedTo: volunteer._id,
      assignedBy: adminUser._id,
      resource: resRaft._id,
      quantityAllocated: 1,
      role: 'lead',
      status: 'assigned',
      assignedAt: new Date(now - 25 * 60 * 1000),
    },
    {
      request: reqMedicalActive._id,
      assignedTo: ngoUser._id,
      assignedBy: adminUser._id,
      resource: resMedKit._id,
      quantityAllocated: 1,
      role: 'medic',
      status: 'assigned',
      assignedAt: new Date(now - 55 * 60 * 1000),
    },
    {
      request: reqRescueActive._id,
      assignedTo: resourceProvider._id,
      assignedBy: adminUser._id,
      resource: resGenerator._id,
      quantityAllocated: 1,
      role: 'driver',
      status: 'en_route',
      assignedAt: new Date(now - 45 * 60 * 1000),
    },
    {
      request: reqWater._id,
      assignedTo: volunteer._id,
      assignedBy: adminUser._id,
      resource: resWaterFilter._id,
      quantityAllocated: 1,
      role: 'support',
      status: 'accepted',
      assignedAt: new Date(now - 15 * 60 * 1000),
    },
  ]);

  // 6. Create Verification records for verified and closed requests
  const verifications = await Verification.create([
    {
      request: reqWater._id,
      verifiedBy: adminUser._id,
      timestamp: new Date(now - 30 * 60 * 1000),
      result: 'verified_legitimate',
      method: 'phone_call',
      remarks: 'Verified directly with municipal water board field staff and Sector 4 resident group.',
      contactAttempted: true,
      priorityAssessment: 'high',
    },
    {
      request: reqRooftop._id,
      verifiedBy: adminUser._id,
      timestamp: new Date(now - 25 * 60 * 1000),
      result: 'verified_legitimate',
      method: 'cross_reference',
      remarks: 'Visual confirmation from police patrolling squad. Immediate raft extraction required.',
      contactAttempted: true,
      priorityAssessment: 'critical',
    },
    {
      request: reqDuplicate._id,
      verifiedBy: adminUser._id,
      timestamp: new Date(now - 15 * 60 * 1000),
      result: 'duplicate',
      method: 'cross_reference',
      remarks: 'Cross-referenced GPS coordinates and caller description; confirmed duplicate of ticket REQ-2026-004832.',
      contactAttempted: true,
      priorityAssessment: 'low',
    },
  ]);

  // 7. Create Notifications
  const notifications = await Notification.create([
    {
      recipient: affectedPerson._id,
      request: reqWater._id,
      type: 'request_verified',
      title: 'Request REQ-2026-004815 Verified',
      message: 'Central dispatch desk has verified your water supplies request.',
      isRead: true,
      readAt: new Date(now - 28 * 60 * 1000),
    },
    {
      recipient: affectedPerson._id,
      request: reqRescueActive._id,
      type: 'request_claimed',
      title: 'Responder Dispatched for REQ-2026-004795',
      message: 'Rahul Sharma (Volunteer) has claimed your request and is en route.',
      isRead: false,
    },
    {
      recipient: volunteer._id,
      request: reqRescueActive._id,
      type: 'new_message',
      title: 'New message on REQ-2026-004795',
      message: 'Amrita Devi: "We are 4 adults on the first floor terrace near the yellow water tank."',
      isRead: false,
    },
    {
      recipient: adminUser._id,
      type: 'system_alert',
      title: 'River Basin Flash Flood Warning',
      message: 'Sutlej water levels exceeded danger mark at Sector 4 barrage. High priority dispatch active.',
      isRead: false,
    },
  ]);

  // 8. Create Message Thread on reqRescueActive (REQ-2026-004795)
  const messages = await Message.create([
    {
      request: reqRescueActive._id,
      sender: volunteer._id,
      senderRole: 'claimant',
      senderName: 'Rahul Sharma',
      body: 'Departing Sector 4 boat depot with rescue raft. ETA 12 minutes.',
      createdAt: new Date(now - 80 * 60 * 1000),
    },
    {
      request: reqRescueActive._id,
      sender: affectedPerson._id,
      senderRole: 'requester',
      senderName: 'Amrita Devi',
      body: 'Understood. We are 4 adults on the first floor terrace near the yellow water tank.',
      createdAt: new Date(now - 75 * 60 * 1000),
    },
    {
      request: reqRescueActive._id,
      sender: adminUser._id,
      senderRole: 'admin',
      senderName: 'Central Dispatch Admin',
      body: 'NDRF boat team has also been notified as secondary backup on channel 4.',
      createdAt: new Date(now - 70 * 60 * 1000),
    },
  ]);

  // 9. Create Evidence metadata on reqRooftop (REQ-2026-004808)
  const evidence = await Evidence.create([
    {
      request: reqRooftop._id,
      uploader: affectedPerson._id,
      uploaderName: 'Amrita Devi',
      fileName: 'rooftop_flooding_sector4.jpg',
      fileType: 'image/jpeg',
      fileUrl: '/uploads/evidence/sample_rooftop_flooding.jpg',
      fileSize: 1845200,
      description: 'Photo taken from rooftop showing flood level at ground-floor ceiling.',
      uploadedAt: new Date(now - 35 * 60 * 1000),
    },
  ]);

  // 10. Create Incident grouping a few requests
  const incident = await Incident.create({
    incidentId: 'INC-2026-GHAGGAR-01',
    name: '2026 Ghaggar-Sutlej Flash Inundation',
    description: 'Continuous 150mm rainfall causing river basin breach and urban flooding across Sectors 3 to 6.',
    status: 'open',
    severity: 'critical',
    location: {
      description: 'Sectors 3 to 6, Ludhiana Urban Basin',
      lat: 30.9050,
      lng: 75.8550,
      radiusKm: 8,
    },
    requests: [
      reqUnverified1._id,
      reqUnverified2._id,
      reqRooftop._id,
      reqRescueActive._id,
    ],
    createdBy: adminUser._id,
  });

  // Link incidentId on the grouped requests
  await Request.updateMany(
    { _id: { $in: [reqUnverified1._id, reqUnverified2._id, reqRooftop._id, reqRescueActive._id] } },
    { $set: { incidentId: incident._id } }
  );

  // 11. Prime realistic baseline telemetry samples for Propagation Latency metric
  [16, 22, 19, 28, 21, 18, 25, 20].forEach((lat) => recordTelemetrySample(lat));

  const incidents = [incident];

  return {
    users,
    requests,
    organizations,
    resources,
    inventories,
    verifications,
    categories: customCategories,
    notifications,
    messages,
    evidence,
    incidents,
  };
}
