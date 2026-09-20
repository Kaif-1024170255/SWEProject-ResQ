import { Schema, model, Document, Types } from 'mongoose';

export type MessageSenderRole = 'claimant' | 'requester' | 'admin';

export interface IMessage extends Document {
  request: Types.ObjectId;
  sender?: Types.ObjectId;
  senderRole: MessageSenderRole;
  senderName: string;
  senderPhone?: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: [true, 'Message must be linked to a request'],
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    senderRole: {
      type: String,
      enum: ['claimant', 'requester', 'admin'],
      required: [true, 'Sender role is required'],
    },
    senderName: {
      type: String,
      required: [true, 'Sender name is required'],
      trim: true,
    },
    senderPhone: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Message body cannot be empty'],
      trim: true,
      maxlength: [2000, 'Message body cannot exceed 2000 characters'],
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ request: 1, createdAt: 1 });

export const Message = model<IMessage>('Message', messageSchema);
