// ==========================================
// Auth Routes — Signup / Login / Me
// ==========================================

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/connection';
import { authMiddleware } from '../middleware/auth';
import {
  AuthStream,
  authenticateDevAuthUser,
  createDevAuthUser,
  getDevAuthUserByEmail,
  getDevAuthUserById,
  isDevAuthFallbackEnabled,
} from '../services/devAuthStore';

const router = Router();
const VALID_STREAMS = new Set<AuthStream>(['SEE', 'PLUS2_SCIENCE', 'PLUS2_MANAGEMENT']);

function collectErrorSignals(error: unknown): { codes: Set<string>; messages: string[] } {
  const codes = new Set<string>();
  const messages: string[] = [];
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    const maybe = current as { code?: unknown; message?: unknown; errors?: unknown };

    if (typeof maybe.code === 'string' && maybe.code) {
      codes.add(maybe.code);
    }

    if (typeof maybe.message === 'string' && maybe.message) {
      messages.push(maybe.message);
    }

    if (Array.isArray(maybe.errors)) {
      queue.push(...maybe.errors);
    }
  }

  return { codes, messages };
}

function isDbConnectionError(error: unknown): boolean {
  const { codes, messages } = collectErrorSignals(error);

  if (codes.has('ECONNREFUSED') || codes.has('ENOTFOUND') || codes.has('EHOSTUNREACH')) {
    return true;
  }

  return messages.some((message) =>
    /ECONNREFUSED|getaddrinfo ENOTFOUND|could not connect|connection terminated|Connection terminated unexpectedly/i.test(
      message
    )
  );
}

function isMissingUsersTableError(error: unknown): boolean {
  const { codes, messages } = collectErrorSignals(error);
  if (codes.has('42P01')) return true;
  return messages.some((message) => message.includes('relation "users" does not exist'));
}

function logAuthError(scope: string, error: unknown): void {
  if (isDbConnectionError(error)) {
    const { messages } = collectErrorSignals(error);
    const summary = messages.find(Boolean) || 'connection failure';
    console.warn(`${scope}: database unavailable (${summary})`);
    return;
  }

  console.error(`${scope}:`, error);
}

function getAuthDbErrorMessage(action: 'signup' | 'login' | 'me', error: unknown): string {
  if (isDbConnectionError(error)) {
    if (isDevAuthFallbackEnabled()) {
      if (action === 'me') {
        return 'Database is not reachable. Returning local auth fallback user.';
      }
      return 'Database is not reachable. Using local development auth fallback.';
    }
    return 'Database is not reachable. Start PostgreSQL or update DATABASE_URL.';
  }

  if (isMissingUsersTableError(error)) {
    return 'Database schema missing. Run: npm --prefix backend run db:init';
  }

  if (action === 'login') return 'Failed to login';
  if (action === 'me') return 'Failed to fetch user';
  return 'Failed to create account';
}

function signAuthToken(user: { id: string; email: string; stream: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, stream: user.stream },
    process.env.JWT_SECRET || 'fallback-secret-change-me',
    { expiresIn: '7d' }
  );
}

// POST /api/auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password, stream } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    stream?: string;
  };

  if (!name || !email || !password || !stream) {
    return res.status(400).json({ error: 'All fields are required: name, email, password, stream' });
  }

  if (!VALID_STREAMS.has(stream as AuthStream)) {
    return res.status(400).json({ error: 'Invalid stream. Must be: SEE, PLUS2_SCIENCE, or PLUS2_MANAGEMENT' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check existing
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (name, email, password, stream)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, stream, created_at`,
      [name, normalizedEmail, hashedPassword, stream]
    );

    const user = result.rows[0];

    const token = signAuthToken(user);

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, stream: user.stream },
      token,
    });
  } catch (error: unknown) {
    if (isDbConnectionError(error) && isDevAuthFallbackEnabled()) {
      const fallbackResult = createDevAuthUser({
        name,
        email: normalizedEmail,
        password,
        stream: stream as AuthStream,
      });

      if (fallbackResult.error === 'EMAIL_EXISTS') {
        return res.status(409).json({ error: 'Email already registered' });
      }

      if (fallbackResult.user) {
        return res.status(201).json({
          user: fallbackResult.user,
          token: signAuthToken(fallbackResult.user),
          mode: 'dev-auth-fallback',
          note: 'Database unavailable. User is stored in memory for this backend session only.',
        });
      }
    }

    logAuthError('Signup error', error);
    res.status(500).json({ error: getAuthDbErrorMessage('signup', error) });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signAuthToken(user);

    res.json({
      user: { id: user.id, name: user.name, email: user.email, stream: user.stream },
      token,
    });
  } catch (error: unknown) {
    if (isDbConnectionError(error) && isDevAuthFallbackEnabled()) {
      const fallbackUser = authenticateDevAuthUser(normalizedEmail, password);
      if (!fallbackUser) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      return res.json({
        user: fallbackUser,
        token: signAuthToken(fallbackUser),
        mode: 'dev-auth-fallback',
        note: 'Database unavailable. Auth state is running in memory for this backend session.',
      });
    }

    logAuthError('Login error', error);
    res.status(500).json({ error: getAuthDbErrorMessage('login', error) });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, stream, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error: unknown) {
    if (isDbConnectionError(error) && isDevAuthFallbackEnabled()) {
      const fromStore =
        getDevAuthUserById(req.user!.id) ||
        getDevAuthUserByEmail(req.user!.email);

      if (fromStore) {
        return res.json({ user: fromStore, mode: 'dev-auth-fallback' });
      }

      return res.json({
        user: {
          id: req.user!.id,
          name: 'Demo User',
          email: req.user!.email,
          stream: req.user!.stream,
          created_at: new Date().toISOString(),
        },
        mode: 'dev-auth-fallback',
      });
    }

    logAuthError('Get me error', error);
    res.status(500).json({ error: getAuthDbErrorMessage('me', error) });
  }
});

export default router;
