import { Schema, model, Document, Types } from 'mongoose';

export type ResourceOwnerType = 'Organization' | 'User';

export interface IResource extends Document {
  name: string;
  category: string;
  unit: string;
  description?: string;
  ownerType: ResourceOwnerType;
  ownerId: Types.ObjectId;
  isPerishable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    name: {
      type: String,
      required: [true, 'Resource name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Resource category is required'],
      trim: true,
    },
    unit: {
      type: String,
      required: [true, 'Resource unit of measure is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      required: false,
    },
    ownerType: {
      type: String,
      enum: {
        values: ['Organization', 'User'],
        message: '{VALUE} is not a valid owner type',
      },
      required: [true, 'Owner type is required'],
      default: 'Organization',
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Owner ID is required'],
      refPath: 'ownerType',
    },
    isPerishable: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Resource = model<IResource>('Resource', resourceSchema);
