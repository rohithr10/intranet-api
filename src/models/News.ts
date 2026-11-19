import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { NEWS_SCOPES, PUBLISH_STATUSES } from '../types/domain.js';

const revisionSchema = new Schema(
  {
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    body: { type: String, default: '' },
    status: { type: String, default: 'draft' },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    editedAt: { type: Date, default: Date.now },
  },
  { _id: true, versionKey: false },
);

const newsSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 240 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    summary: { type: String, trim: true, maxlength: 600, default: '' },
    body: { type: String, default: '' },
    featuredImage: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    images: { type: [{ type: Schema.Types.ObjectId, ref: 'Media' }], default: [] },
    /** Editorial label shown on the portal card, e.g. "CYBERSECURITY". */
    category: { type: String, trim: true, uppercase: true, default: 'GENERAL', index: true },
    /** The portal's Global / Local news filter. */
    scope: { type: String, enum: NEWS_SCOPES, default: 'Global', index: true },
    /** Proper references — never comma-separated strings. */
    tags: { type: [{ type: Schema.Types.ObjectId, ref: 'Tag' }], default: [], index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
    seoTitle: { type: String, trim: true, maxlength: 160, default: '' },
    seoDescription: { type: String, trim: true, maxlength: 320, default: '' },
    isFeatured: { type: Boolean, default: false, index: true },
    revisions: { type: [revisionSchema], default: [], select: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true } },
);

newsSchema.index({ title: 'text', summary: 'text', body: 'text' });
newsSchema.index({ status: 1, publishedAt: -1 });
newsSchema.index({ scope: 1, status: 1, publishedAt: -1 });

export type NewsAttrs = InferSchemaType<typeof newsSchema>;
export type NewsDoc = HydratedDocument<NewsAttrs>;
export const News = model('News', newsSchema);
