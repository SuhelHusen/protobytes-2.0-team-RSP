// ==========================================
// Chat Route — RAG-powered Q&A
// ==========================================
// POST /api/chat — Ask a question, get AI answer with citations

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { answerQuestion } from '../services/ragService';
import pool from '../db/connection';

const router = Router();

function getChatErrorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message || '';

  if (message.includes('Ollama') || message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    const model = process.env.OLLAMA_MODEL || 'gemma3:12b';
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    if (message.toLowerCase().includes('not found') && message.toLowerCase().includes('model')) {
      return `Ollama model "${model}" is missing. Run: ollama pull ${model}`;
    }
    return `Cannot reach Ollama at ${baseUrl}. Start Ollama and ensure model "${model}" is available.`;
  }

  if (message.includes('API_KEY_INVALID') || message.includes('Incorrect API key')) {
    return 'AI API key is invalid. Update GEMINI_API_KEY/OPENAI_API_KEY in backend/.env and restart backend, or switch AI_PROVIDER=ollama.';
  }

  if (
    message.includes('Too Many Requests') ||
    message.includes('exceeded your current quota') ||
    message.includes('rate limit')
  ) {
    return 'Model quota/rate limit exceeded. Check Gemini billing/quota, or switch provider.';
  }

  if (message.toLowerCase().includes('out of memory')) {
    return 'Server ran out of memory while processing this request. Try a smaller source PDF.';
  }

  return `Chat failed: ${message}`;
}

// POST /api/chat
router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { question, strictMode = true } = req.body;
    const userId = req.user!.id;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log(`💬 [Chat] User ${userId.substring(0, 8)}... asks: "${question.substring(0, 80)}..."`);

    const result = await answerQuestion(question.trim(), userId, strictMode);

    // Save to chat history
    try {
      await pool.query(
        `INSERT INTO chat_history (user_id, question, answer, citations)
         VALUES ($1, $2, $3, $4)`,
        [userId, question, result.answer, JSON.stringify(result.citations)]
      );
    } catch (histErr) {
      console.error('Failed to save chat history (non-fatal):', histErr);
    }

    res.json({
      answer: result.answer,
      citations: result.citations,
      strictMode,
    });
  } catch (error: unknown) {
    console.error('Chat error:', error);
    res.status(500).json({ error: getChatErrorMessage(error) });
  }
});

// GET /api/chat/history — Get chat history
router.get('/chat/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await pool.query(
      `SELECT id, question, answer, citations, created_at
       FROM chat_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user!.id, limit]
    );
    res.json({ history: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// DELETE /api/chat/history — Clear user's chat history
router.delete('/chat/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM chat_history WHERE user_id = $1`,
      [req.user!.id]
    );
    res.json({
      success: true,
      deleted: result.rowCount || 0,
    });
  } catch {
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

export default router;
