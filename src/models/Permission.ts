import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const permissionSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z]+(\.[a-z]+)+$/, 'Permission keys look like "users.create"'],
    },
    group: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { timestamps: true, versionKey: false },
);

export type PermissionAttrs = InferSchemaType<typeof permissionSchema>;
export type PermissionDoc = HydratedDocument<PermissionAttrs>;
export const Permission = model('Permission', permissionSchema);
