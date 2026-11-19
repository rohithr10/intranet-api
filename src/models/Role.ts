import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-]+$/, 'Role keys may contain lowercase letters, numbers and hyphens'],
    },
    description: { type: String, trim: true, maxlength: 240, default: '' },
    /** Permission keys (not ObjectIds): stable across re-seeds and cheap to check. */
    permissions: { type: [String], default: [], index: true },
    /**
     * A super admin role implies every permission, present and future, so a
     * newly added permission key cannot lock the owner out of their own system.
     */
    isSuperAdmin: { type: Boolean, default: false },
    /** System roles ship with the product; they cannot be deleted or re-keyed. */
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

roleSchema.index({ name: 'text', description: 'text' });

export type RoleAttrs = InferSchemaType<typeof roleSchema>;
export type RoleDoc = HydratedDocument<RoleAttrs>;
export const Role = model('Role', roleSchema);
