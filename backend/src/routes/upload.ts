// ==========================================
// PDF Upload Route
// ==========================================
// POST /api/upload — Upload PDF → Extract → Chunk → Embed → Store

import { Router, Request, Response } from 'express';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';
import { extractTextFromPDF } from '../services/pdfService';
import { chunkText } from '../services/chunkService';
import { storeChunks } from '../services/vectorStore';
import pool from '../db/connection';
import { isDevAuthFallbackEnabled } from '../services/devAuthStore';
import { deleteDevSource, listDevSources, upsertDevSource } from '../services/devSourceStore';

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

function getUploadErrorMessage(error: unknown): string {
  const { messages } = collectErrorSignals(error);
  const message = messages.find(Boolean) || '';

  if (isDbConnectionError(error)) {
    if (isDevAuthFallbackEnabled()) {
      return 'Database is not reachable. Upload completed in local fallback mode for this backend session.';
    }
    return 'Database is not reachable. Start PostgreSQL or update DATABASE_URL.';
  }

  if (message.includes('API_KEY_INVALID') || message.includes('Incorrect API key')) {
    return 'AI API key is invalid. Fix GEMINI_API_KEY/OPENAI_API_KEY in backend/.env, or switch AI_PROVIDER=ollama.';
  }

  if (message.includes('Ollama') || message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    const model = process.env.OLLAMA_EMBED_MODEL || process.env.OLLAMA_MODEL || 'nomic-embed-text';
    return `Cannot reach Ollama/local embedding model (${model}). Start Ollama, or configure cloud keys.`;
  }

  if (message.toLowerCase().includes('out of memory')) {
    return 'File processing exceeded server memory limits. Try a smaller/cleaner PDF.';
  }

  return `Failed to process PDF: ${message}`;
}

router.post(
  '/upload',
  authMiddleware,
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No PDF file uploaded. Use form field name "file".' });
      }

      const userId = req.user!.id;
      const sourceId = uuid();

      // Step 1: Extract text from PDF
      console.log(`📄 [Upload] Extracting text from: ${file.originalname}`);
      const extracted = await extractTextFromPDF(file.path);
      console.log(`   → ${extracted.totalPages} pages, ${extracted.pages.length} non-empty pages`);

      if (extracted.pages.length === 0) {
        return res.status(422).json({
          error: 'Could not extract any text from this PDF. It may be scanned/image-only.',
        });
      }

      // Step 2: Save source record
      try {
        await pool.query(
          `INSERT INTO sources (id, user_id, file_name, file_path, content, total_pages)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sourceId, userId, file.originalname, file.path, extracted.fullText.substring(0, 50000), extracted.totalPages]
        );
      } catch (dbError) {
        if (isDbConnectionError(dbError) && isDevAuthFallbackEnabled()) {
          upsertDevSource({
            id: sourceId,
            userId,
            fileName: file.originalname,
            filePath: file.path,
            totalPages: extracted.totalPages,
          });
          console.warn('⚠️  [Upload] Database unavailable, source metadata saved in local memory fallback.');
        } else {
          throw dbError;
        }
      }

      // Step 3: Chunk the text
      console.log(`✂️  [Upload] Chunking text...`);
      const chunks = chunkText(extracted.pages, sourceId);
      console.log(`   → Created ${chunks.length} chunks`);

      // Step 4: Embed and store
      console.log(`🧠 [Upload] Generating embeddings and storing...`);
      const { stored } = await storeChunks(chunks, userId, file.originalname);

      console.log(`✅ [Upload] Complete! ${file.originalname}: ${extracted.totalPages} pages, ${stored} chunks stored`);

      res.json({
        success: true,
        sourceId,
        fileName: file.originalname,
        totalPages: extracted.totalPages,
        totalChunks: stored,
        pagesExtracted: extracted.pages.length,
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: getUploadErrorMessage(error) });
    }
  }
);

// GET /api/sources — List user's uploaded sources
router.get('/sources', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await (async () => {
      try {
        const result = await pool.query(
          `SELECT id, file_name, file_path, total_pages, created_at
           FROM sources WHERE user_id = $1
           ORDER BY created_at DESC`,
          [req.user!.id]
        );
        return result.rows;
      } catch (dbError) {
        if (isDbConnectionError(dbError) && isDevAuthFallbackEnabled()) {
          console.warn('⚠️  [Sources] Database unavailable, listing local fallback sources.');
          return listDevSources(req.user!.id);
        }
        throw dbError;
      }
    })();

    const origin = `${req.protocol}://${req.get('host')}`;
    const sources = rows.map((row) => {
      const storedPath = row.file_path as string | undefined;
      const fileName = storedPath ? path.basename(storedPath) : '';
      return {
        id: row.id,
        file_name: row.file_name,
        total_pages: row.total_pages,
        created_at: row.created_at,
        file_url: fileName ? `${origin}/uploads/${encodeURIComponent(fileName)}` : undefined,
      };
    });
    res.json({ sources });
  } catch (error: unknown) {
    res.status(500).json({ error: getUploadErrorMessage(error) });
  }
});

// DELETE /api/sources/:id — Delete a source and its chunks
router.delete('/sources/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sourceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    let deleted: { id: string; file_name: string } | null = null;

    try {
      const result = await pool.query(
        `DELETE FROM sources WHERE id = $1 AND user_id = $2 RETURNING id, file_name`,
        [sourceId, req.user!.id]
      );
      deleted = result.rows[0] || null;
    } catch (dbError) {
      if (isDbConnectionError(dbError) && isDevAuthFallbackEnabled()) {
        console.warn('⚠️  [Sources] Database unavailable, deleting from local fallback sources.');
        const fallbackDeleted = deleteDevSource(sourceId, req.user!.id);
        deleted = fallbackDeleted
          ? { id: fallbackDeleted.id, file_name: fallbackDeleted.file_name }
          : null;
      } else {
        throw dbError;
      }
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json({ success: true, deleted });
  } catch (error: unknown) {
    res.status(500).json({ error: getUploadErrorMessage(error) });
  }
});

export default router;
