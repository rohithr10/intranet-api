import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PUBLISH_STATUSES } from '../types/domain.js';

/** A point-in-time snapshot kept whenever an editor saves over a document. */
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

/**
 * Managed page/document content. In this portal it backs the Documents
 * section: `category` is the folder ("Code of Conduct") and `country` is the
 * country tab ("URBASER GROUP", "INDIA", …).
 */
const contentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 240 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    summary: { type: String, trim: true, maxlength: 600, default: '' },
    body: { type: String, default: '' },
    featuredImage: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    media: { type: [{ type: Schema.Types.ObjectId, ref: 'Media' }], default: [] },
    /** Folder name in the Documents section. */
    category: { type: String, trim: true, required: true, index: true },
    country: { type: String, trim: true, default: 'URBASER GROUP', index: true },
    tags: { type: [{ type: Schema.Types.ObjectId, ref: 'Tag' }], default: [], index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: PUBLISH_STATUSES, default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
    /** Downloadable attachment shown in the folder dialog. */
    attachment: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    order: { type: Number, default: 0 },
    revisions: { type: [revisionSchema], default: [], select: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false, toJSON: { virtuals: true } },
);

contentSchema.index({ title: 'text', summary: 'text', body: 'text', category: 'text' });
contentSchema.index({ status: 1, publishedAt: -1 });
contentSchema.index({ country: 1, category: 1 });

export type ContentAttrs = InferSchemaType<typeof contentSchema>;
export type ContentDoc = HydratedDocument<ContentAttrs>;
export const Content = model('Content', contentSchema);
