import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACTIVE_STATUSES } from '../types/domain.js';

const tagSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    /** Optional accent colour used by the portal tag chips. */
    color: {
      type: String,
      trim: true,
      default: null,
      match: [/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colour must be a hex value like #a3e635'],
    },
    status: { type: String, enum: ACTIVE_STATUSES, default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

tagSchema.index({ name: 'text' });

export type TagAttrs = InferSchemaType<typeof tagSchema>;
export type TagDoc = HydratedDocument<TagAttrs>;
export const Tag = model('Tag', tagSchema);
