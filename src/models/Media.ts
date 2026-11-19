import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Metadata only. The bytes live in the configured storage driver (local disk by
 * default) under `storageKey`; MongoDB holds the record that points at them.
 */
const mediaSchema = new Schema(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true, index: true },
    size: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    alt: { type: String, trim: true, maxlength: 240, default: '' },
    folder: { type: String, trim: true, default: 'general', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

mediaSchema.index({ originalName: 'text', alt: 'text' });
mediaSchema.index({ createdAt: -1 });

export type MediaAttrs = InferSchemaType<typeof mediaSchema>;
export type MediaDoc = HydratedDocument<MediaAttrs>;
export const Media = model('Media', mediaSchema);
