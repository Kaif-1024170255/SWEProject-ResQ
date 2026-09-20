import { Schema, model, Document, Types } from 'mongoose';

export type RequestResourceStatus =
  | 'pending'
  | 'partially_allocated'
  | 'fully_allocated';

export interface IRequestResource extends Document {
  request: Types.ObjectId;
  resource: Types.ObjectId;
  quantityRequested: number;
  quantityAllocated: number;
  quantityFulfilled: number;
  status: RequestResourceStatus;
  allocate(quantity: number): Promise<IRequestResource>;
  deallocate(quantity: number): Promise<IRequestResource>;
  createdAt: Date;
  updatedAt: Date;
}

const requestResourceSchema = new Schema<IRequestResource>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request reference is required'],
      index: true,
    },
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required'],
      index: true,
    },
    quantityRequested: {
      type: Number,
      required: [true, 'Requested quantity is required'],
      min: [1, 'Requested quantity must be at least 1'],
    },
    quantityAllocated: {
      type: Number,
      default: 0,
      min: [0, 'Allocated quantity cannot be negative'],
    },
    quantityFulfilled: {
      type: Number,
      default: 0,
      min: [0, 'Fulfilled quantity cannot be negative'],
    },
    status: {
      type: String,
      enum: ['pending', 'partially_allocated', 'fully_allocated'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

// Method to allocate quantity towards this requirement
requestResourceSchema.methods.allocate = async function (
  this: IRequestResource,
  quantity: number
): Promise<IRequestResource> {
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Allocation quantity must be a positive number');
  }

  this.quantityAllocated += quantity;

  if (this.quantityAllocated >= this.quantityRequested) {
    this.status = 'fully_allocated';
  } else if (this.quantityAllocated > 0) {
    this.status = 'partially_allocated';
  } else {
    this.status = 'pending';
  }

  return this.save();
};

// Method to deallocate/release allocation
requestResourceSchema.methods.deallocate = async function (
  this: IRequestResource,
  quantity: number
): Promise<IRequestResource> {
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Deallocation quantity must be a positive number');
  }

  this.quantityAllocated = Math.max(0, this.quantityAllocated - quantity);

  if (this.quantityAllocated >= this.quantityRequested) {
    this.status = 'fully_allocated';
  } else if (this.quantityAllocated > 0) {
    this.status = 'partially_allocated';
  } else {
    this.status = 'pending';
  }

  return this.save();
};

export const RequestResource = model<IRequestResource>(
  'RequestResource',
  requestResourceSchema
);
