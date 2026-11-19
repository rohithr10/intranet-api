import bcrypt from 'bcrypt';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { env } from '../config/environment.js';
import { USER_STATUSES } from '../types/domain.js';

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    /** Never leaves the server: `select: false` keeps it out of every query by default. */
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    department: { type: String, trim: true, maxlength: 120, default: '' },
    country: { type: String, trim: true, maxlength: 80, default: '' },
    jobTitle: { type: String, trim: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    /** Shown in the people directory; false keeps an account out of it. */
    showInDirectory: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    /**
     * Bumped on logout-everywhere, password change, deactivation or role change
     * so already-issued tokens stop working immediately instead of lingering
     * until they expire.
     */
    tokenVersion: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.index({ name: 'text', email: 'text', department: 'text', country: 'text' });
userSchema.index({ createdAt: -1 });

/** Initials used by the portal avatars ("Eva Fernández" → "EF"). */
userSchema.virtual('initials').get(function (this: HydratedDocument<UserAttrs>) {
  return String(this.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
});

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);
