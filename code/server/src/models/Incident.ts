import { Schema, model, Document, Types } from 'mongoose';

export type IncidentStatus = 'open' | 'contained' | 'closed';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IIncidentLocation {
  description: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface IIncident extends Document {
  incidentId: string;
  name: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  location: IIncidentLocation;
  requests: Types.ObjectId[];
  createdBy: Types.ObjectId;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const incidentSchema = new Schema<IIncident>(
  {
    incidentId: {
      type: String,
      required: [true, 'Incident identifier is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Incident name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Incident description is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'contained', 'closed'],
      default: 'open',
      index: true,
    },
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'high',
      index: true,
    },
    location: {
      description: {
        type: String,
        required: [true, 'Incident location description is required'],
        trim: true,
      },
      lat: { type: Number },
      lng: { type: Number },
      radiusKm: { type: Number, min: 0 },
    },
    requests: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Request',
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Incident creator is required'],
    },
    closedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

incidentSchema.index({ status: 1, severity: 1 });
incidentSchema.index({ requests: 1 });

export const Incident = model<IIncident>('Incident', incidentSchema);
