// ==========================================
// AI Study Planner — Backend Entry Point
// ==========================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { testConnection, checkPgVector } from './db/connection';

// Load env
dotenv.config();

// Routes
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import chatRoutes from './routes/chat';
import mcqRoutes from './routes/mcq';
import flashcardRoutes from './routes/flashcard';
import mindmapRoutes from './routes/mindmap';
import tasksRoutes from './routes/tasks';
import scheduleRoutes from './routes/schedule';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

function isLikelyPlaceholderKey(value?: string): boolean {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return normalized.includes('xxxxxxxx') || normalized.includes('replace');
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value == null || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// ── Middleware ──────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (for debug/dev)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Root info ─────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    service: 'AI Study Planner Backend',
    status: 'ok',
    health: '/api/health',
    docsHint: 'Use /api/* endpoints',
  });
});

// ── Health check ───────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const provider = process.env.AI_PROVIDER || 'gemini';
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let pgvector = false;

  try {
    const connected = await testConnection();
    dbStatus = connected ? 'connected' : 'disconnected';
    if (connected) {
      pgvector = await checkPgVector();
    }
  } catch {
    dbStatus = 'disconnected';
  }

  res.json({
    status: 'ok',
    service: 'AI Study Planner Backend',
    aiProvider: provider,
    database: dbStatus,
    pgvector,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);      // /api/upload, /api/sources
app.use('/api', chatRoutes);        // /api/chat, /api/chat/history
app.use('/api', mcqRoutes);         // /api/generate-mcq, /api/mcqs
app.use('/api', flashcardRoutes);   // /api/generate-flashcards, /api/flashcards
app.use('/api', mindmapRoutes);     // /api/generate-mindmap, /api/mindmaps
app.use('/api', tasksRoutes);       // /api/tasks, /api/tasks/stats, /api/tasks/reorder
app.use('/api', scheduleRoutes);    // /api/schedule/*

// ── 404 fallback ───────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ───────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ───────────────────────────────────────
async function main() {
  console.log('\n========================================');
  console.log('  AI Study Planner — Backend');
  console.log('========================================\n');

  // Test DB
  try {
    const connected = await testConnection();
    if (connected) {
      const hasPgVector = await checkPgVector();
      console.log(`✅ Database connected`);
      console.log(`📦 pgvector: ${hasPgVector ? 'available' : 'NOT available (using in-memory fallback)'}`);
    } else {
      console.warn('⚠️  Database not connected — auth/upload/chat endpoints will fail');
      console.warn('   Set DATABASE_URL and run schema init: npm --prefix backend run db:init');
    }
  } catch (err) {
    console.warn('⚠️  Database not connected — endpoints requiring DB will fail');
    console.warn('   Start PostgreSQL and run schema.sql, or endpoints will use in-memory store');
  }

  // AI Provider
  const provider = process.env.AI_PROVIDER || 'gemini';
  const hasOpenAI = !isLikelyPlaceholderKey(process.env.OPENAI_API_KEY);
  const hasGemini = !isLikelyPlaceholderKey(process.env.GEMINI_API_KEY);
  const ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:4b';
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const ollamaConfigured =
    readBooleanEnv('OLLAMA_ENABLED', true) && !readBooleanEnv('OLLAMA_DISABLED', false);
  console.log(
    `🤖 AI Provider mode: ${provider} (OpenAI key: ${hasOpenAI ? 'set' : 'missing'}, Gemini key: ${hasGemini ? 'set' : 'missing'}, Ollama: ${ollamaConfigured ? `${ollamaModel} @ ${ollamaBase}` : 'not configured'})`
  );

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
    console.log('Available endpoints:');
    console.log('  POST   /api/auth/signup');
    console.log('  POST   /api/auth/login');
    console.log('  GET    /api/auth/me');
    console.log('  POST   /api/upload');
    console.log('  GET    /api/sources');
    console.log('  DELETE /api/sources/:id');
    console.log('  POST   /api/chat');
    console.log('  GET    /api/chat/history');
    console.log('  POST   /api/generate-mcq');
    console.log('  GET    /api/mcqs');
    console.log('  POST   /api/generate-flashcards');
    console.log('  GET    /api/flashcards');
    console.log('  POST   /api/generate-mindmap');
    console.log('  GET    /api/mindmaps');
    console.log('  GET    /api/tasks');
    console.log('  POST   /api/tasks');
    console.log('  PATCH  /api/tasks/:id');
    console.log('  DELETE /api/tasks/:id');
    console.log('  GET    /api/tasks/stats');
    console.log('  PUT    /api/tasks/reorder');
    console.log('  POST   /api/schedule/generate');
    console.log('  POST   /api/schedule/breakdown');
    console.log('  GET    /api/schedule/day?date=YYYY-MM-DD');
    console.log('  GET    /api/schedule/week?date=YYYY-MM-DD');
    console.log('  GET    /api/schedule/month?year=YYYY&month=MM');
    console.log('  GET    /api/schedule/hourly?date=YYYY-MM-DD');
    console.log('  GET    /api/schedule/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD');
    console.log('  POST   /api/schedule/sessions');
    console.log('  PATCH  /api/schedule/sessions/:id');
    console.log('  DELETE /api/schedule/sessions/:id');
    console.log('');
  });
}

main();
