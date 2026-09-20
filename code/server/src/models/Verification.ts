import { Schema, model, Document, Types } from 'mongoose';

export type VerificationResult =
  | 'verified_legitimate'
  | 'duplicate'
  | 'unfounded'
  | 'spam_or_hoax'
  | 'unreachable'
  | 'needs_more_info';

export const VERIFICATION_RESULTS: VerificationResult[] = [
  'verified_legitimate',
  'duplicate',
  'unfounded',
  'spam_or_hoax',
  'unreachable',
  'needs_more_info',
];

export type VerificationMethod =
  | 'phone_call'
  | 'field_visit'
  | 'third_party_ngo'
  | 'cross_reference'
  | 'trusted_contact'
  | 'other';

export const VERIFICATION_METHODS: VerificationMethod[] = [
  'phone_call',
  'field_visit',
  'third_party_ngo',
  'cross_reference',
  'trusted_contact',
  'other',
];

export interface IVerification extends Document {
  request: Types.ObjectId;
  verifiedBy: Types.ObjectId;
  timestamp: Date;
  result: VerificationResult;
  remarks?: string;
  method: VerificationMethod;
  contactAttempted: boolean;
  priorityAssessment?: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
}

const verificationSchema = new Schema<IVerification>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Request reference is required'],
      index: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Verifier reference is required'],
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    result: {
      type: String,
      enum: {
        values: VERIFICATION_RESULTS,
        message: '{VALUE} is not a valid verification result',
      },
      default: 'verified_legitimate',
      required: true,
    },
    remarks: {
      type: String,
      trim: true,
      required: false,
    },
    method: {
      type: String,
      enum: {
        values: VERIFICATION_METHODS,
        message: '{VALUE} is not a valid verification method',
      },
      default: 'phone_call',
    },
    contactAttempted: {
      type: Boolean,
      default: true,
    },
    priorityAssessment: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Verification = model<IVerification>('Verification', verificationSchema);
