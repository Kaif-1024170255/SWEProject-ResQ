import { Schema, model, Document, Types } from 'mongoose';

export type InventoryStatus = 'available' | 'low_stock' | 'depleted' | 'reserved';

export interface IInventoryLocation {
  address?: string;
  lat?: number;
  lng?: number;
}

export interface IResourceInventory extends Document {
  resource: Types.ObjectId;
  organization?: Types.ObjectId;
  ownerType: 'Organization' | 'User';
  ownerId: Types.ObjectId;
  quantityAvailable: number;
  quantityReserved: number;
  location?: IInventoryLocation;
  status: InventoryStatus;
  notes?: string;
  reserve(quantity: number): Promise<IResourceInventory>;
  release(quantity: number): Promise<IResourceInventory>;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryLocationSchema = new Schema<IInventoryLocation>(
  {
    address: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

const resourceInventorySchema = new Schema<IResourceInventory>(
  {
    resource: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'Resource reference is required'],
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
    },
    ownerType: {
      type: String,
      enum: ['Organization', 'User'],
      required: true,
      default: 'Organization',
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Owner ID is required'],
      refPath: 'ownerType',
      index: true,
    },
    quantityAvailable: {
      type: Number,
      required: [true, 'Available quantity is required'],
      min: [0, 'Available quantity cannot be negative'],
      default: 0,
    },
    quantityReserved: {
      type: Number,
      required: [true, 'Reserved quantity is required'],
      min: [0, 'Reserved quantity cannot be negative'],
      default: 0,
    },
    location: {
      type: inventoryLocationSchema,
      required: false,
    },
    status: {
      type: String,
      enum: ['available', 'low_stock', 'depleted', 'reserved'],
      default: 'available',
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

// Method to reserve quantity
resourceInventorySchema.methods.reserve = async function (
  this: IResourceInventory,
  quantity: number
): Promise<IResourceInventory> {
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity to reserve must be a positive number');
  }
  if (this.quantityAvailable < quantity) {
    throw new Error(
      `Insufficient available inventory: requested ${quantity}, but only ${this.quantityAvailable} available`
    );
  }

  this.quantityAvailable -= quantity;
  this.quantityReserved += quantity;

  if (this.quantityAvailable === 0) {
    this.status = 'depleted';
  } else if (this.quantityAvailable < 5) {
    this.status = 'low_stock';
  } else {
    this.status = 'available';
  }

  return this.save();
};

// Method to release quantity
resourceInventorySchema.methods.release = async function (
  this: IResourceInventory,
  quantity: number
): Promise<IResourceInventory> {
  if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
    throw new Error('Quantity to release must be a positive number');
  }
  if (this.quantityReserved < quantity) {
    throw new Error(
      `Cannot release ${quantity}: only ${this.quantityReserved} currently reserved`
    );
  }

  this.quantityReserved -= quantity;
  this.quantityAvailable += quantity;

  if (this.quantityAvailable >= 5) {
    this.status = 'available';
  } else if (this.quantityAvailable > 0) {
    this.status = 'low_stock';
  } else {
    this.status = 'depleted';
  }

  return this.save();
};

export const ResourceInventory = model<IResourceInventory>(
  'ResourceInventory',
  resourceInventorySchema
);
