// ==========================================
// MCQ Generation Service
// ==========================================
// Generates multiple-choice questions from uploaded source content.

import { getAIProvider, ChatMessage } from './aiProvider';
import { getChunksBySource } from './vectorStore';

export interface MCQ {
  question: string;
  options: string[];      // ["A) ...", "B) ...", "C) ...", "D) ..."]
  correctAnswer: string;  // "A", "B", "C", or "D"
  explanation: string;
  sourcePage: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Generate MCQs from a specific source (PDF).
 * Optionally filter by a chapter/topic hint.
 */
export async function generateMCQs(
  sourceId: string,
  numberOfQuestions: number = 10,
  chapterHint?: string,
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed'
): Promise<MCQ[]> {
  // 1. Fetch chunks from the source
  const chunks = await getChunksBySource(sourceId);

  if (chunks.length === 0) {
    throw new Error('No content found for this source. Make sure the PDF was processed.');
  }

  // 2. Build context (limit to ~8000 chars to fit in prompt)
  let context = '';
  for (const chunk of chunks) {
    if (context.length > 8000) break;
    context += `[Page ${chunk.pageNumber}]: ${chunk.text}\n\n`;
  }

  // 3. Prompt
  const difficultyInstruction = difficulty === 'mixed' || !difficulty
    ? 'Include a mix of easy (30%), medium (40%), and hard (30%) questions.'
    : `All questions should be ${difficulty} difficulty.`;

  const prompt = `Based on the following textbook content, generate exactly ${numberOfQuestions} multiple-choice questions suitable for Nepali SEE/+2 exam preparation.
${chapterHint ? `Focus specifically on: ${chapterHint}` : 'Cover the key concepts from the provided content.'}

CONTENT:
${context}

RULES:
1. Each question must be answerable from the content above.
2. Provide exactly 4 options (A, B, C, D) for each question.
3. Include the correct answer letter and a brief explanation.
4. ${difficultyInstruction}
5. Include a mix of: conceptual, factual, and application questions.
6. Reference the page number where the answer can be found.
7. Make distractors (wrong options) plausible but clearly wrong.
8. Assign a difficulty level to each question.

Return ONLY a valid JSON array (no markdown, no code fences):
[
  {
    "question": "What is Newton's First Law of Motion?",
    "options": ["A) A body at rest stays at rest unless acted upon by an external force", "B) Force equals mass times acceleration", "C) Every action has an equal and opposite reaction", "D) Energy cannot be created or destroyed"],
    "correctAnswer": "A",
    "explanation": "Newton's First Law states that a body at rest stays at rest and a body in motion stays in motion unless acted upon by an external unbalanced force. This is also known as the law of inertia.",
    "sourcePage": 23,
    "difficulty": "easy"
  }
]`;

  // 4. Generate
  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an expert exam question generator for Nepali students. Return ONLY valid JSON arrays. No markdown formatting.' },
    { role: 'user', content: prompt },
  ];

  const response = await ai.chat(messages, {
    temperature: 0.7,
    maxTokens: 4000,
  });

  // 5. Parse JSON
  return parseMCQResponse(response);
}

function parseMCQResponse(raw: string): MCQ[] {
  // Clean potential markdown code fences
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  // Try to find JSON array in the response
  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Expected array');

    return parsed.map((item: any) => ({
      question: item.question || '',
      options: Array.isArray(item.options) ? item.options : [],
      correctAnswer: item.correctAnswer || 'A',
      explanation: item.explanation || '',
      sourcePage: item.sourcePage || 1,
      difficulty: item.difficulty || 'medium',
    }));
  } catch (err) {
    console.error('Failed to parse MCQ response:', err);
    console.error('Raw response:', raw.substring(0, 500));
    throw new Error('AI returned invalid JSON. Please try again.');
  }
}
