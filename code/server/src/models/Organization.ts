import { Schema, model, Document, Types } from 'mongoose';

export type OrganizationType =
  | 'ngo'
  | 'government'
  | 'hospital'
  | 'supplier'
  | 'community_group';

export const ORGANIZATION_TYPES: OrganizationType[] = [
  'ngo',
  'government',
  'hospital',
  'supplier',
  'community_group',
];

export interface IOrganization extends Document {
  name: string;
  type: OrganizationType;
  registrationNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  operatingRegion?: string;
  address?: string;
  isVerified: boolean;
  primaryContact?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      enum: {
        values: ORGANIZATION_TYPES,
        message: '{VALUE} is not a valid organization type',
      },
      required: [true, 'Organization type is required'],
      default: 'ngo',
    },
    registrationNumber: {
      type: String,
      trim: true,
      required: false,
    },
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid contact email address'],
      required: false,
    },
    contactPhone: {
      type: String,
      trim: true,
      required: false,
    },
    operatingRegion: {
      type: String,
      trim: true,
      required: false,
    },
    address: {
      type: String,
      trim: true,
      required: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    primaryContact: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Organization = model<IOrganization>('Organization', organizationSchema);
