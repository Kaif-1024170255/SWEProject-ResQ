import { Schema, model, Document, Types } from 'mongoose';

export type RequestCategory =
  | 'medical'
  | 'shelter'
  | 'supplies'
  | 'rescue'
  | 'other';

export const REQUEST_CATEGORIES: RequestCategory[] = [
  'medical',
  'shelter',
  'supplies',
  'rescue',
  'other',
];

export type RequestStatus =
  | 'unverified'
  | 'verified'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export const REQUEST_STATUSES: RequestStatus[] = [
  'unverified',
  'verified',
  'in_progress',
  'resolved',
  'closed',
];

export interface ILocation {
  preciseLat: number;
  preciseLng: number;
  publicLat: number;
  publicLng: number;
}

export interface IStatusHistoryEntry {
  status: RequestStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId;
  note?: string;
}

export interface IRequest extends Document {
  requestId: string;
  category: RequestCategory;
  description: string;
  location: ILocation;
  status: RequestStatus;
  createdBy?: Types.ObjectId;
  contactPhone?: string;
  claimedBy?: Types.ObjectId;
  statusHistory: IStatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Fuzzes coordinates by a random distance between 200m and 400m
 * so precise coordinates are not exposed publicly.
 */
export function calculateFuzzedCoordinates(
  preciseLat: number,
  preciseLng: number
): { publicLat: number; publicLng: number } {
  // Random radius between 200 and 400 meters
  const minMeters = 200;
  const maxMeters = 400;
  const radiusMeters = minMeters + Math.random() * (maxMeters - minMeters);

  // Random direction angle (0 to 2*PI)
  const angle = Math.random() * 2 * Math.PI;

  const metersPerDegreeLat = 111320;
  const deltaLat = (radiusMeters * Math.cos(angle)) / metersPerDegreeLat;

  // Longitude scaling based on latitude
  const latRadians = (preciseLat * Math.PI) / 180;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(latRadians);
  const deltaLng = (radiusMeters * Math.sin(angle)) / (metersPerDegreeLng || 1);

  return {
    publicLat: Number((preciseLat + deltaLat).toFixed(6)),
    publicLng: Number((preciseLng + deltaLng).toFixed(6)),
  };
}

/**
 * Generates a human-readable unique request ID, e.g. REQ-2026-004821
 */
export function generateRequestId(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `REQ-${year}-${randomSuffix}`;
}

const locationSchema = new Schema<ILocation>(
  {
    preciseLat: {
      type: Number,
      required: [true, 'Precise latitude is required'],
    },
    preciseLng: {
      type: Number,
      required: [true, 'Precise longitude is required'],
    },
    publicLat: {
      type: Number,
      required: [true, 'Public latitude is required'],
    },
    publicLng: {
      type: Number,
      required: [true, 'Public longitude is required'],
    },
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    note: {
      type: String,
      trim: true,
      required: false,
    },
  },
  { _id: false }
);

const requestSchema = new Schema<IRequest>(
  {
    requestId: {
      type: String,
      unique: true,
      index: true,
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: REQUEST_CATEGORIES,
        message: '{VALUE} is not a valid request category',
      },
      required: [true, 'Category is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    location: {
      type: locationSchema,
      required: [true, 'Location is required'],
    },
    status: {
      type: String,
      enum: {
        values: REQUEST_STATUSES,
        message: '{VALUE} is not a valid request status',
      },
      default: 'unverified',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    contactPhone: {
      type: String,
      trim: true,
      required: false,
    },
    claimedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook to generate requestId and compute public coordinates if not already present
requestSchema.pre('validate', function () {
  if (!this.requestId) {
    this.requestId = generateRequestId();
  }

  if (
    this.location &&
    this.location.preciseLat !== undefined &&
    this.location.preciseLng !== undefined
  ) {
    // If publicLat or publicLng are missing or zero, compute them
    if (this.location.publicLat === undefined || this.location.publicLng === undefined) {
      const fuzzed = calculateFuzzedCoordinates(
        this.location.preciseLat,
        this.location.preciseLng
      );
      this.location.publicLat = fuzzed.publicLat;
      this.location.publicLng = fuzzed.publicLng;
    }
  }

  // Populate initial statusHistory entry on creation if array is empty
  if (this.isNew && this.statusHistory.length === 0 && this.status) {
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      changedBy: this.createdBy,
      note: 'Initial request submission',
    });
  }
});

export const Request = model<IRequest>('Request', requestSchema);
