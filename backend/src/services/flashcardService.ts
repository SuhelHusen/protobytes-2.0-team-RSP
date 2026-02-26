// ==========================================
// Flashcard Generation Service
// ==========================================
// Generates study flashcards from uploaded source content.

import { getAIProvider, ChatMessage } from './aiProvider';
import { getChunksBySource } from './vectorStore';

export interface Flashcard {
  front: string;        // Question / term
  back: string;         // Answer / definition
  sourcePage: number;
  category: 'definition' | 'concept' | 'formula' | 'fact' | 'application';
}

/**
 * Generate flashcards from a specific source.
 */
export async function generateFlashcards(
  sourceId: string,
  count: number = 15,
  topic?: string
): Promise<Flashcard[]> {
  const chunks = await getChunksBySource(sourceId);

  if (chunks.length === 0) {
    throw new Error('No content found for this source.');
  }

  // Build context
  let context = '';
  for (const chunk of chunks) {
    if (context.length > 8000) break;
    context += `[Page ${chunk.pageNumber}]: ${chunk.text}\n\n`;
  }

  const prompt = `Based on this textbook content, create exactly ${count} study flashcards for Nepali SEE/+2 exam preparation.
${topic ? `Focus on: ${topic}` : 'Cover the key concepts from the content.'}

CONTENT:
${context}

RULES:
1. Front: A clear question, term, or prompt.
2. Back: A concise, accurate answer or definition from the content.
3. Mix different types: definitions, concepts, formulas, facts, and applications.
4. Include the source page number.
5. Use simple English appropriate for Nepali students.
6. For formulas, write them clearly (e.g., F = ma).
7. Assign a category to each flashcard.

Return ONLY a valid JSON array (no markdown, no code fences):
[
  {
    "front": "What is the SI unit of force?",
    "back": "The SI unit of force is Newton (N). 1 Newton is the force needed to accelerate a 1 kg mass by 1 m/s².",
    "sourcePage": 23,
    "category": "definition"
  }
]`;

  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an expert study material creator for Nepali students. Return ONLY valid JSON arrays. No markdown formatting.' },
    { role: 'user', content: prompt },
  ];

  const response = await ai.chat(messages, {
    temperature: 0.7,
    maxTokens: 4000,
  });

  return parseFlashcardResponse(response);
}

function parseFlashcardResponse(raw: string): Flashcard[] {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Expected array');

    return parsed.map((item: any) => ({
      front: item.front || '',
      back: item.back || '',
      sourcePage: item.sourcePage || 1,
      category: item.category || 'concept',
    }));
  } catch (err) {
    console.error('Failed to parse flashcard response:', err);
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}
