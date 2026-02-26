// ==========================================
// Flashcard Generation Route
// ==========================================
// POST /api/generate-flashcards — Generate flashcards from uploaded source

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { generateFlashcards } from '../services/flashcardService';
import pool from '../db/connection';
import { isDevAuthFallbackEnabled } from '../services/devAuthStore';
import { getDevSource } from '../services/devSourceStore';

const router = Router();

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
    /postgres|5432|database|ECONNREFUSED|getaddrinfo ENOTFOUND|could not connect|Connection terminated unexpectedly/i.test(
      message
    )
  );
}

// POST /api/generate-flashcards
router.post('/generate-flashcards', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sourceId, count = 15, topic } = req.body;

    if (!sourceId) {
      return res.status(400).json({ error: 'sourceId is required' });
    }

    // Verify ownership
    let sourceFileName = '';
    try {
      const sourceCheck = await pool.query(
        'SELECT id, file_name FROM sources WHERE id = $1 AND user_id = $2',
        [sourceId, req.user!.id]
      );
      if (sourceCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Source not found' });
      }
      sourceFileName = sourceCheck.rows[0].file_name;
    } catch (dbError) {
      if (isDbConnectionError(dbError) && isDevAuthFallbackEnabled()) {
        const fallbackSource = getDevSource(sourceId, req.user!.id);
        if (!fallbackSource) {
          return res.status(404).json({ error: 'Source not found' });
        }
        sourceFileName = fallbackSource.file_name;
      } else {
        throw dbError;
      }
    }

    const cardCount = Math.min(Math.max(parseInt(count) || 15, 1), 50);

    console.log(`🃏 [Flashcards] Generating ${cardCount} flashcards from ${sourceFileName}`);

    const flashcards = await generateFlashcards(sourceId, cardCount, topic);

    // Save
    try {
      await pool.query(
        `INSERT INTO generated_content (user_id, source_id, type, content, topic)
         VALUES ($1, $2, 'flashcard', $3, $4)`,
        [req.user!.id, sourceId, JSON.stringify(flashcards), topic || 'General']
      );
    } catch (saveErr) {
      console.error('Failed to save flashcards (non-fatal):', saveErr);
    }

    res.json({
      success: true,
      count: flashcards.length,
      sourceFileName,
      flashcards,
    });
  } catch (error: any) {
    console.error('Flashcard generation error:', error);
    res.status(500).json({ error: `Failed to generate flashcards: ${error.message}` });
  }
});

// GET /api/flashcards — Get previously generated flashcards
router.get('/flashcards', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT gc.id, gc.content, gc.topic, gc.created_at, s.file_name
       FROM generated_content gc
       LEFT JOIN sources s ON gc.source_id = s.id
       WHERE gc.user_id = $1 AND gc.type = 'flashcard'
       ORDER BY gc.created_at DESC
       LIMIT 20`,
      [req.user!.id]
    );
    res.json({
      flashcardSets: result.rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        fileName: r.file_name,
        flashcards: r.content,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch flashcards' });
  }
});

export default router;
