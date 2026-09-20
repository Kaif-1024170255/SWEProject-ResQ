import { Schema, model, Document, Types } from 'mongoose';

export type UserRole =
  | 'affected_person'
  | 'volunteer'
  | 'ngo'
  | 'resource_provider'
  | 'admin';

export const USER_ROLES: UserRole[] = [
  'affected_person',
  'volunteer',
  'ngo',
  'resource_provider',
  'admin',
];

export interface IUserLocation {
  address?: string;
  lat?: number;
  lng?: number;
}

export interface IUserAvailability {
  status?: 'available' | 'busy' | 'offline';
  startHour?: number;
  endHour?: number;
  days?: string[];
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId?: Types.ObjectId;
  location?: IUserLocation;
  availability?: IUserAvailability;
  skills?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userLocationSchema = new Schema<IUserLocation>(
  {
    address: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

const userAvailabilitySchema = new Schema<IUserAvailability>(
  {
    status: {
      type: String,
      enum: ['available', 'busy', 'offline'],
      default: 'available',
    },
    startHour: { type: Number, min: 0, max: 23 },
    endHour: { type: Number, min: 0, max: 23 },
    days: [{ type: String, lowercase: true }],
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: '{VALUE} is not a valid user role',
      },
      required: [true, 'Role is required'],
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
    },
    location: {
      type: userLocationSchema,
      required: false,
    },
    availability: {
      type: userAvailabilitySchema,
      required: false,
    },
    skills: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const User = model<IUser>('User', userSchema);
