// ==========================================
// Embedding Service
// ==========================================
// Thin wrapper around the AI provider's embed() method.
// Used by the vector store to generate embeddings.

import { getAIProvider } from './aiProvider';

/**
 * Generate an embedding for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = getAIProvider();
  const results = await provider.embed([text]);
  return results[0];
}

/**
 * Generate embeddings for multiple text strings (batched).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const provider = getAIProvider();
  return provider.embed(texts);
}

/**
 * Returns the embedding dimension for the active provider.
 */
export function getEmbeddingDimension(): number {
  return getAIProvider().embeddingDimension;
}
