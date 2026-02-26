// ==========================================
// Vector Store — pgvector + in-memory fallback
// ==========================================
// Stores chunk embeddings and performs similarity search.
// Automatically uses pgvector if available, otherwise
// falls back to in-memory search (cosine + keyword fallback).

import pool, { checkPgVector } from '../db/connection';
import { generateEmbedding, generateEmbeddings } from './embeddingService';
import { Chunk } from './chunkService';

// -------------------------------------------
// Types
// -------------------------------------------
export interface SearchResult {
  text: string;
  pageNumber: number;
  fileName: string;
  sourceId: string;
  similarity: number;
}

interface StoredVector {
  id: string;
  sourceId: string;
  userId: string;
  fileName: string;
  text: string;
  pageNumber: number;
  embedding: number[] | null;
}

// -------------------------------------------
// In-Memory Fallback Store
// -------------------------------------------
const memoryStore: StoredVector[] = [];
const MAX_CHUNKS_TO_EMBED = 800;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
}

function keywordSimilarity(query: string, text: string): number {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;

  const textTokens = new Set(tokenize(text));
  let overlap = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) overlap += 1;
  }

  const overlapScore = overlap / queryTokens.length;
  const phraseBoost = text.toLowerCase().includes(query.toLowerCase()) ? 0.15 : 0;
  return Math.min(overlapScore + phraseBoost, 1);
}

// -------------------------------------------
// State
// -------------------------------------------
let usePgVector: boolean | null = null;

async function shouldUsePgVector(): Promise<boolean> {
  if (usePgVector !== null) return usePgVector;
  usePgVector = await checkPgVector();
  return usePgVector;
}

// -------------------------------------------
// Store Chunks
// -------------------------------------------
export async function storeChunks(
  chunks: Chunk[],
  userId: string,
  fileName: string
): Promise<{ stored: number }> {
  if (chunks.length === 0) return { stored: 0 };

  let chunksToStore = chunks;
  if (chunks.length > MAX_CHUNKS_TO_EMBED) {
    console.warn(
      `⚠️  Too many chunks (${chunks.length}). Limiting to first ${MAX_CHUNKS_TO_EMBED} for memory safety.`
    );
    chunksToStore = chunks.slice(0, MAX_CHUNKS_TO_EMBED);
  }

  const texts = chunksToStore.map((c) => c.text);
  let embeddings: number[][] | null = null;
  try {
    console.log(`📦 Embedding ${chunksToStore.length} chunks...`);
    const generated = await generateEmbeddings(texts);
    if (generated.length === chunksToStore.length) {
      embeddings = generated;
      console.log(`✅ Generated ${generated.length} embeddings (dim=${generated[0]?.length})`);
    } else {
      console.warn(
        `⚠️  Embedding count mismatch (${generated.length}/${chunksToStore.length}); falling back to keyword retrieval for this source.`
      );
    }
  } catch (error: unknown) {
    const message = (error as { message?: string })?.message || 'Embedding failed';
    console.warn(`⚠️  Embedding failed (${message}). Falling back to keyword retrieval for this source.`);
  }

  const pgvAvailable = await shouldUsePgVector();

  if (pgvAvailable && embeddings) {
    return storeChunksPg(chunksToStore, embeddings);
  }

  if (pgvAvailable && !embeddings) {
    console.warn('⚠️  pgvector available but embeddings failed; storing in memory without vectors.');
  }

  return storeChunksMemory(chunksToStore, embeddings, userId, fileName);
}

async function storeChunksPg(chunks: Chunk[], embeddings: number[][]): Promise<{ stored: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(',')}]`;

      await client.query(
        `INSERT INTO chunks (source_id, text, page_number, chunk_index, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [chunk.sourceId, chunk.text, chunk.pageNumber, chunk.chunkIndex, embeddingStr]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ Stored ${chunks.length} chunks in pgvector`);
    return { stored: chunks.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function storeChunksMemory(
  chunks: Chunk[],
  embeddings: number[][] | null,
  userId: string,
  fileName: string
): { stored: number } {
  for (let i = 0; i < chunks.length; i++) {
    memoryStore.push({
      id: `mem_${Date.now()}_${i}`,
      sourceId: chunks[i].sourceId,
      userId,
      fileName,
      text: chunks[i].text,
      pageNumber: chunks[i].pageNumber,
      embedding: embeddings ? embeddings[i] || null : null,
    });
  }
  console.log(`✅ Stored ${chunks.length} chunks in memory (total: ${memoryStore.length})`);
  return { stored: chunks.length };
}

// -------------------------------------------
// Similarity Search
// -------------------------------------------
export async function searchSimilarChunks(
  query: string,
  userId: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const pgvAvailable = await shouldUsePgVector();
  let queryEmbedding: number[] | null = null;

  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (error: unknown) {
    const message = (error as { message?: string })?.message || 'Embedding failed';
    console.warn(`⚠️  Query embedding failed (${message}). Falling back to keyword retrieval.`);
  }

  if (pgvAvailable && queryEmbedding) {
    return searchPg(queryEmbedding, userId, topK);
  }

  return searchMemory(query, queryEmbedding, userId, topK);
}

async function searchPg(queryEmbedding: number[], userId: string, topK: number): Promise<SearchResult[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const result = await pool.query(
    `SELECT c.text, c.page_number, s.file_name, c.source_id,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM chunks c
     JOIN sources s ON c.source_id = s.id
     WHERE s.user_id = $2
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, userId, topK]
  );

  return result.rows.map((row) => ({
    text: row.text,
    pageNumber: row.page_number,
    fileName: row.file_name,
    sourceId: row.source_id,
    similarity: parseFloat(row.similarity),
  }));
}

function searchMemory(
  query: string,
  queryEmbedding: number[] | null,
  userId: string,
  topK: number
): SearchResult[] {
  const userChunks = memoryStore.filter((v) => v.userId === userId);

  if (userChunks.length === 0) return [];

  const scored = userChunks.map((v) => ({
    text: v.text,
    pageNumber: v.pageNumber,
    fileName: v.fileName,
    sourceId: v.sourceId,
    similarity:
      queryEmbedding && v.embedding
        ? cosineSimilarity(queryEmbedding, v.embedding)
        : keywordSimilarity(query, v.text),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// -------------------------------------------
// Get chunks by source ID (for MCQ/flashcard context)
// -------------------------------------------
export async function getChunksBySource(sourceId: string): Promise<{ text: string; pageNumber: number }[]> {
  const pgvAvailable = await shouldUsePgVector();

  if (pgvAvailable) {
    const result = await pool.query(
      `SELECT text, page_number FROM chunks WHERE source_id = $1 ORDER BY chunk_index`,
      [sourceId]
    );
    return result.rows.map((r) => ({ text: r.text, pageNumber: r.page_number }));
  } else {
    return memoryStore
      .filter((v) => v.sourceId === sourceId)
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((v) => ({ text: v.text, pageNumber: v.pageNumber }));
  }
}

/**
 * Get all sources for a user.
 */
export async function getUserSources(userId: string): Promise<{ id: string; fileName: string; totalPages: number }[]> {
  const result = await pool.query(
    `SELECT id, file_name, total_pages FROM sources WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows.map((r) => ({ id: r.id, fileName: r.file_name, totalPages: r.total_pages }));
}
