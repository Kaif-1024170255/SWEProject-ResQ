import { Schema, model, Document, Types } from 'mongoose';

export type AssignmentRole = 'lead' | 'support' | 'driver' | 'medic' | 'general';
export type AssignmentStatus =
  | 'assigned'
  | 'accepted'
  | 'en_route'
  | 'on_scene'
  | 'completed'
  | 'cancelled'
  | 'abandoned';

export interface IRequestAssignment extends Document {
  request: Types.ObjectId;
  assignedTo: Types.ObjectId;
  assignedBy: Types.ObjectId;
  assignedOrg?: Types.ObjectId;
  resource?: Types.ObjectId;
  quantityAllocated?: number;
  role: AssignmentRole;
  status: AssignmentStatus;
  assignedAt: Date;
  completedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const requestAssignmentSchema = new Schema<IRequestAssignment>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request reference is required'],
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned user reference is required'],
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigning user reference is required'],
    },
    assignedOrg: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: false,
      index: true,
    },
    quantityAllocated: {
      type: Number,
      default: 1,
      min: [0, 'Allocated quantity cannot be negative'],
    },
    role: {
      type: String,
      enum: ['lead', 'support', 'driver', 'medic', 'general'],
      default: 'lead',
    },
    status: {
      type: String,
      enum: [
        'assigned',
        'accepted',
        'en_route',
        'on_scene',
        'completed',
        'cancelled',
        'abandoned',
      ],
      default: 'assigned',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    completedAt: {
      type: Date,
      required: false,
    },
    notes: {
      type: String,
      trim: true,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const RequestAssignment = model<IRequestAssignment>(
  'RequestAssignment',
  requestAssignmentSchema
);
