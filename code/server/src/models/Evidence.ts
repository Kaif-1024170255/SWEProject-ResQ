import { Schema, model, Document, Types } from 'mongoose';

export interface IEvidence extends Document {
  request: Types.ObjectId;
  uploader?: Types.ObjectId;
  uploaderName: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  fileSize?: number;
  description?: string;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceSchema = new Schema<IEvidence>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Evidence must be linked to an emergency request'],
      index: true,
    },
    uploader: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    uploaderName: {
      type: String,
      required: [true, 'Uploader name is required'],
      trim: true,
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    fileType: {
      type: String,
      required: [true, 'File type is required'],
      trim: true,
    },
    fileUrl: {
      type: String,
      required: [true, 'File URL is required'],
      trim: true,
    },
    fileSize: {
      type: Number,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

evidenceSchema.index({ request: 1, uploadedAt: -1 });

export const Evidence = model<IEvidence>('Evidence', evidenceSchema);
