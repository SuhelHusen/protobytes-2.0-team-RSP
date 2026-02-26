// ==========================================
// RAG (Retrieval-Augmented Generation) Service
// ==========================================

import { getAIProvider, ChatMessage } from './aiProvider';
import { searchSimilarChunks, SearchResult } from './vectorStore';

export interface Citation {
  fileName: string;
  pageNumber: number;
  text: string;        // snippet preview
  sourceId: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  chunks: SearchResult[];  // raw search results for debugging
}

function uniqueChunksBySourcePage(chunks: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const unique: SearchResult[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.sourceId}::${chunk.pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(chunk);
  }

  return unique;
}

function normalizeAnswerWithNumberedCitations(answer: string, citations: Citation[]): string {
  let text = (answer || '').replace(/\*\*/g, '').trim();

  const citationIndex = new Map<string, number>();
  citations.forEach((citation, index) => {
    citationIndex.set(`${citation.fileName.toLowerCase()}::${citation.pageNumber}`, index + 1);
  });

  text = text.replace(
    /\[?\s*Source:\s*([^\(\]\n]+?)\s*\(Page\s*(\d+)\)\s*\]?/gi,
    (_match, fileName, pageNumber) => {
      const key = `${String(fileName).trim().toLowerCase()}::${Number(pageNumber)}`;
      const ref = citationIndex.get(key);
      return ref ? `[${ref}]` : '';
    }
  );

  text = text.replace(/(?:^|\n)\s*Citations?:.*$/gim, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n');

  if (citations.length > 0) {
    const citationLine = `Citations: ${citations.map((_, index) => `[${index + 1}]`).join(', ')}`;
    text = `${text}\n\n${citationLine}`.trim();
  }

  return text;
}

/**
 * Answer a question using RAG — grounded in the user's uploaded sources.
 */
export async function answerQuestion(
  question: string,
  userId: string,
  strictMode: boolean = true,
  topK: number = 5
): Promise<ChatResponse> {
  // 1. Retrieve relevant chunks
  const relevantChunks = await searchSimilarChunks(question, userId, topK);
  const uniqueChunks = uniqueChunksBySourcePage(relevantChunks);

  if (uniqueChunks.length === 0) {
    return {
      answer:
        "I couldn't find any relevant information in your uploaded sources. Please upload a textbook PDF first, then ask your question.",
      citations: [],
      chunks: [],
    };
  }

  // 2. Build context block with numbered sources
  const context = uniqueChunks
    .map(
      (chunk, i) =>
        `[${i + 1}] ${chunk.fileName}, Page ${chunk.pageNumber}\n${chunk.text}`
    )
    .join('\n\n---\n\n');

  // 3. System prompt
  const systemPrompt = strictMode
    ? `You are an AI study assistant for Nepali students preparing for SEE and +2 exams.

STRICT RULES:
- Answer ONLY using information from the provided sources below.
- If the answer is NOT found in the sources, say: "I couldn't find this information in your uploaded materials."
- NEVER make up information or use your general knowledge.
- Keep answers clear, concise, and student-friendly.
- Use simple English appropriate for Nepali students.
- For mathematical formulas, use clear notation.
- If the question is in Nepali, respond in Nepali but keep technical terms in English.
- Format your answer as:
  1) One short direct answer sentence.
  2) 2-4 bullet points with key supporting facts.
  3) End with "Citations: [n], [m]" using only the source numbers provided.
- Do NOT print file names/pages in the body text. Use only numeric citation markers like [1], [2].

SOURCES:
${context}`
    : `You are an AI study assistant for Nepali students preparing for SEE and +2 exams.
You may use general knowledge to supplement your answer, but always prefer information from the provided sources.
Keep answers clear and student-friendly.
Use concise numbered citations [1], [2] based on the source list below, and end with "Citations: ...".

SOURCES:
${context}`;

  // 4. Generate answer
  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ];

  const rawAnswer = await ai.chat(messages, {
    temperature: strictMode ? 0.2 : 0.5,
    maxTokens: 1500,
  });

  // 5. Build citations
  const citations: Citation[] = uniqueChunks.map((chunk) => ({
    fileName: chunk.fileName,
    pageNumber: chunk.pageNumber,
    text: chunk.text.substring(0, 250) + (chunk.text.length > 250 ? '...' : ''),
    sourceId: chunk.sourceId,
  }));

  const answer = normalizeAnswerWithNumberedCitations(rawAnswer, citations);
  return { answer, citations, chunks: relevantChunks };
}
