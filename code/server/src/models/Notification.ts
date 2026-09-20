import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'request_verified'
  | 'request_claimed'
  | 'request_resolved'
  | 'new_message'
  | 'system_alert'
  | 'dispatch_invite';

export interface INotification extends Document {
  recipient: Types.ObjectId;
  request?: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Notification recipient is required'],
      index: true,
    },
    request: {
      type: Schema.Types.ObjectId,
      ref: 'Request',
      required: false,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'request_verified',
        'request_claimed',
        'request_resolved',
        'new_message',
        'system_alert',
        'dispatch_invite',
      ],
      default: 'system_alert',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = model<INotification>('Notification', notificationSchema);
