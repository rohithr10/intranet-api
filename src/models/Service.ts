import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { SERVICE_STATUSES, SERVICE_VISIBILITIES } from '../types/domain.js';

/**
 * A service is an application tile in the portal's Applications section.
 * Status and visibility here drive what the portal actually renders, so
 * disabling a service in the admin removes the tile for everyone.
 */
const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'Service keys may contain lowercase letters, numbers and hyphens'],
    },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    details: { type: String, trim: true, maxlength: 4000, default: '' },
    features: { type: [String], default: [] },
    departmentOwner: { type: String, trim: true, maxlength: 120, default: '' },
    contactEmail: { type: String, trim: true, maxlength: 160, default: '' },
    thumbnailUrl: { type: String, trim: true, maxlength: 500, default: '' },
    /** lucide-react icon name, e.g. "ShieldCheck" — resolved by the frontend. */
    icon: { type: String, trim: true, default: 'LayoutGrid' },
    category: { type: String, trim: true, default: 'GENERAL', index: true },
    /** Matches the portal's Applications tabs: GENERAL / EMPLOYEE PORTAL. */
    tab: { type: String, trim: true, uppercase: true, default: 'GENERAL', index: true },
    url: { type: String, trim: true, default: '' },
    status: { type: String, enum: SERVICE_STATUSES, default: 'enabled', index: true },
    visibility: { type: String, enum: SERVICE_VISIBILITIES, default: 'public', index: true },
    /** Empty = every role; otherwise only these roles see the tile. */
    roles: { type: [{ type: Schema.Types.ObjectId, ref: 'Role' }], default: [] },
    /** Free-form per-service settings (rendered as JSON in the admin). */
    config: { type: Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true } },
);

serviceSchema.index({ name: 'text', description: 'text', key: 'text' });
serviceSchema.index({ tab: 1, order: 1 });

export type ServiceAttrs = InferSchemaType<typeof serviceSchema>;
export type ServiceDoc = HydratedDocument<ServiceAttrs>;
export const Service = model('Service', serviceSchema);
