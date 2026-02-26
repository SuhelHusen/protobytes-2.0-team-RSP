// ==========================================
// Mind Map Generation Route
// ==========================================
// POST /api/generate-mindmap — Generate mind map from source or query

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { generateMindMap, generateMindMapFromQuery } from '../services/mindmapService';
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

// POST /api/generate-mindmap
router.post('/generate-mindmap', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sourceId, topic, query } = req.body;

    // Two modes: from a specific source, or from a search query
    if (!sourceId && !query) {
      return res.status(400).json({
        error: 'Provide either sourceId (to generate from a specific PDF) or query (to search across all sources)',
      });
    }

    let mindmap;

    if (sourceId) {
      // Mode 1: Generate from a specific source
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

      console.log(`🧠 [MindMap] Generating from ${sourceFileName} ${topic ? `(topic: ${topic})` : ''}`);
      mindmap = await generateMindMap(sourceId, topic);
    } else {
      // Mode 2: Generate from a search query across all sources
      console.log(`🧠 [MindMap] Generating from query: "${query}"`);
      mindmap = await generateMindMapFromQuery(query!, req.user!.id);
    }

    // Save
    try {
      await pool.query(
        `INSERT INTO generated_content (user_id, source_id, type, content, topic)
         VALUES ($1, $2, 'mindmap', $3, $4)`,
        [req.user!.id, sourceId || null, JSON.stringify(mindmap), topic || query || 'General']
      );
    } catch (saveErr) {
      console.error('Failed to save mind map (non-fatal):', saveErr);
    }

    res.json({
      success: true,
      mindmap,
    });
  } catch (error: any) {
    console.error('Mind map generation error:', error);
    res.status(500).json({ error: `Failed to generate mind map: ${error.message}` });
  }
});

// GET /api/mindmaps — Get previously generated mind maps
router.get('/mindmaps', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT gc.id, gc.content, gc.topic, gc.created_at, s.file_name
       FROM generated_content gc
       LEFT JOIN sources s ON gc.source_id = s.id
       WHERE gc.user_id = $1 AND gc.type = 'mindmap'
       ORDER BY gc.created_at DESC
       LIMIT 20`,
      [req.user!.id]
    );
    res.json({
      mindmaps: result.rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        fileName: r.file_name,
        mindmap: r.content,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mind maps' });
  }
});

export default router;
