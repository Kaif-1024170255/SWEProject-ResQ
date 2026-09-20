import { Schema, model, Document } from 'mongoose';

export type CategoryPriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface IEmergencyCategory extends Document {
  name: string;
  label: string;
  description: string;
  priority_level: CategoryPriorityLevel;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const emergencyCategorySchema = new Schema<IEmergencyCategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    label: {
      type: String,
      required: [true, 'Category display label is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Category description is required'],
      trim: true,
    },
    priority_level: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

emergencyCategorySchema.index({ isActive: 1, priority_level: 1 });

export const EmergencyCategory = model<IEmergencyCategory>(
  'EmergencyCategory',
  emergencyCategorySchema
);

export const DEFAULT_EMERGENCY_CATEGORIES = [
  {
    name: 'medical',
    label: 'Medical Assistance',
    description: 'First aid, urgent prescriptions, ambulance dispatch, trauma care',
    priority_level: 'critical' as const,
  },
  {
    name: 'rescue',
    label: 'Search & Rescue',
    description: 'Flooding evacuation, trapped persons, collapsed structures, boat rescue',
    priority_level: 'critical' as const,
  },
  {
    name: 'supplies',
    label: 'Food, Water & Essential Supplies',
    description: 'Clean drinking water, rations, hygiene kits, baby food, blankets',
    priority_level: 'high' as const,
  },
  {
    name: 'shelter',
    label: 'Emergency Shelter',
    description: 'Temporary housing, camp capacity, roof repairs, weatherproofing',
    priority_level: 'high' as const,
  },
  {
    name: 'other',
    label: 'General Assistance',
    description: 'Utility outage, missing pet, communications access, general inquiries',
    priority_level: 'medium' as const,
  },
];

export async function seedDefaultCategories(): Promise<void> {
  for (const cat of DEFAULT_EMERGENCY_CATEGORIES) {
    const existing = await EmergencyCategory.findOne({ name: cat.name });
    if (!existing) {
      await EmergencyCategory.create(cat);
    }
  }
}

