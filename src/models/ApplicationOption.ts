import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACTIVE_STATUSES, OPTION_TYPES } from '../types/domain.js';

/**
 * Runtime configuration an administrator can change without a deploy:
 * feature flags, labels, numeric limits, dropdown choices, JSON blocks.
 *
 * `isPublic` controls exposure through GET /api/public/options. Secrets belong
 * in environment variables, never here — the API refuses to serve a value whose
 * key looks like a credential (see optionService).
 */
const applicationOptionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9]+([._-][a-z0-9]+)*$/, 'Option keys look like "portal.hero_title"'],
    },
    description: { type: String, trim: true, maxlength: 400, default: '' },
    type: { type: String, enum: OPTION_TYPES, required: true },
    defaultValue: { type: Schema.Types.Mixed, default: null },
    value: { type: Schema.Types.Mixed, default: null },
    /** Choice list for select / multiselect options. */
    choices: {
      type: [{ label: { type: String, required: true }, value: { type: String, required: true } }],
      default: [],
    },
    /** Optional guardrails applied on every write (see validateOptionValue). */
    validation: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      pattern: { type: String, default: null },
      required: { type: Boolean, default: false },
    },
    module: { type: String, trim: true, default: 'general', index: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    /** Permission key required to change this option, beyond options.edit. */
    editPermission: { type: String, trim: true, default: null },
    /** Whether the portal may read this option without authentication. */
    isPublic: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ACTIVE_STATUSES, default: 'active', index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

applicationOptionSchema.index({ name: 'text', key: 'text', description: 'text' });

export type ApplicationOptionAttrs = InferSchemaType<typeof applicationOptionSchema>;
export type ApplicationOptionDoc = HydratedDocument<ApplicationOptionAttrs>;
export const ApplicationOption = model('ApplicationOption', applicationOptionSchema);
