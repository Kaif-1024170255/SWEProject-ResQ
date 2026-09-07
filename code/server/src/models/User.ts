import { Schema, model, Document } from 'mongoose';

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

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

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
  },
  {
    timestamps: true,
  }
);

export const User = model<IUser>('User', userSchema);
