import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Append-only audit trail. Written by `recordActivity` after every successful
 * administrative mutation and by the auth flow for sign-in attempts.
 */
const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, trim: true, lowercase: true, default: '' },
    /** e.g. "news.publish", "auth.login.failed", "users.create" */
    action: { type: String, required: true, trim: true, index: true },
    entity: { type: String, trim: true, default: '', index: true },
    entityId: { type: String, trim: true, default: '' },
    /** Human-readable description shown in the dashboard activity feed. */
    description: { type: String, trim: true, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
    ip: { type: String, trim: true, default: '' },
    userAgent: { type: String, trim: true, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

activityLogSchema.index({ createdAt: -1 });

export type ActivityLogAttrs = InferSchemaType<typeof activityLogSchema>;
export type ActivityLogDoc = HydratedDocument<ActivityLogAttrs>;
export const ActivityLog = model('ActivityLog', activityLogSchema);
