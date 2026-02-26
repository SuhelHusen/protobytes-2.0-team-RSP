import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export type AuthStream = 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT';

interface DevAuthUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  stream: AuthStream;
  created_at: string;
}

export interface DevAuthUser {
  id: string;
  name: string;
  email: string;
  stream: AuthStream;
  created_at: string;
}

const usersByEmail = new Map<string, DevAuthUserRecord>();
const usersById = new Map<string, DevAuthUserRecord>();
let seeded = false;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeStream(value?: string): AuthStream {
  if (value === 'PLUS2_SCIENCE' || value === 'PLUS2_MANAGEMENT') return value;
  return 'SEE';
}

function toPublicUser(user: DevAuthUserRecord): DevAuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    stream: user.stream,
    created_at: user.created_at,
  };
}

function resolveFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

export function isDevAuthFallbackEnabled(): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) return false;
  return resolveFlag(process.env.ENABLE_DEV_AUTH_FALLBACK, true);
}

function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;

  if (!isDevAuthFallbackEnabled()) return;

  const email = normalizeEmail(process.env.DEV_FALLBACK_EMAIL || 'admin@gmail.com');
  const password = process.env.DEV_FALLBACK_PASSWORD || 'secret123';
  const name = process.env.DEV_FALLBACK_NAME || 'Demo User';
  const stream = normalizeStream(process.env.DEV_FALLBACK_STREAM);

  const user: DevAuthUserRecord = {
    id: process.env.DEV_FALLBACK_ID || randomUUID(),
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    stream,
    created_at: new Date().toISOString(),
  };

  usersByEmail.set(user.email, user);
  usersById.set(user.id, user);
}

export function getDevAuthFallbackCreds(): { email: string; password: string } {
  return {
    email: process.env.DEV_FALLBACK_EMAIL || 'admin@gmail.com',
    password: process.env.DEV_FALLBACK_PASSWORD || 'secret123',
  };
}

export function createDevAuthUser(input: {
  name: string;
  email: string;
  password: string;
  stream: AuthStream;
}): { user?: DevAuthUser; error?: 'EMAIL_EXISTS' } {
  ensureSeeded();

  const normalizedEmail = normalizeEmail(input.email);
  if (usersByEmail.has(normalizedEmail)) {
    return { error: 'EMAIL_EXISTS' };
  }

  const now = new Date().toISOString();
  const user: DevAuthUserRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash: bcrypt.hashSync(input.password, 10),
    stream: normalizeStream(input.stream),
    created_at: now,
  };

  usersByEmail.set(user.email, user);
  usersById.set(user.id, user);

  return { user: toPublicUser(user) };
}

export function authenticateDevAuthUser(email: string, password: string): DevAuthUser | null {
  ensureSeeded();

  const user = usersByEmail.get(normalizeEmail(email));
  if (!user) return null;

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) return null;

  return toPublicUser(user);
}

export function getDevAuthUserById(id: string): DevAuthUser | null {
  ensureSeeded();
  const user = usersById.get(id);
  return user ? toPublicUser(user) : null;
}

export function getDevAuthUserByEmail(email: string): DevAuthUser | null {
  ensureSeeded();
  const user = usersByEmail.get(normalizeEmail(email));
  return user ? toPublicUser(user) : null;
}
