// ==========================================
// Mind Map Generation Service
// ==========================================
// Generates hierarchical mind map data from uploaded content.
// Returns a structured JSON that the frontend can render
// as an interactive mind map visualization.

import { getAIProvider, ChatMessage } from './aiProvider';
import { getChunksBySource } from './vectorStore';
import { searchSimilarChunks } from './vectorStore';

export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  sourcePage?: number;
  children: MindMapNode[];
}

export interface MindMap {
  title: string;
  rootNode: MindMapNode;
  summary: string;
  sourcePages: number[];
}

/**
 * Generate a mind map from a specific source, optionally focused on a topic.
 */
export async function generateMindMap(
  sourceId: string,
  topic?: string
): Promise<MindMap> {
  const chunks = await getChunksBySource(sourceId);

  if (chunks.length === 0) {
    throw new Error('No content found for this source.');
  }

  // Build context
  let context = '';
  const usedPages: number[] = [];
  for (const chunk of chunks) {
    if (context.length > 8000) break;
    context += `[Page ${chunk.pageNumber}]: ${chunk.text}\n\n`;
    if (!usedPages.includes(chunk.pageNumber)) {
      usedPages.push(chunk.pageNumber);
    }
  }

  const topicInstruction = topic
    ? `Create a mind map specifically about: "${topic}"`
    : 'Create a mind map covering the main topics and concepts from the content.';

  const prompt = `${topicInstruction}

Based on the following textbook content:

${context}

Generate a hierarchical mind map structure. The mind map should:
1. Have a clear central topic as the root node.
2. Branch into 3-6 main subtopics.
3. Each subtopic should have 2-5 leaf nodes with key details.
4. Include page references where the information was found.
5. Each node should have a brief description.
6. Keep labels short (2-6 words) and descriptions concise (1-2 sentences).
7. Structure should be logical and useful for exam revision.

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "title": "Newton's Laws of Motion",
  "summary": "A comprehensive overview of the three laws of motion and their applications.",
  "rootNode": {
    "id": "root",
    "label": "Newton's Laws of Motion",
    "description": "Fundamental laws governing how objects move",
    "children": [
      {
        "id": "1",
        "label": "First Law (Inertia)",
        "description": "An object stays at rest or in uniform motion unless acted upon by an external force.",
        "sourcePage": 23,
        "children": [
          {
            "id": "1-1",
            "label": "Definition of Inertia",
            "description": "The tendency of an object to resist changes in its state of motion.",
            "sourcePage": 23,
            "children": []
          },
          {
            "id": "1-2",
            "label": "Examples",
            "description": "A ball on a table stays still; a passenger lurches forward when a bus stops.",
            "sourcePage": 24,
            "children": []
          }
        ]
      }
    ]
  }
}`;

  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are an expert educational content organizer. You create clear, hierarchical mind maps from textbook content for Nepali students. Return ONLY valid JSON. No markdown formatting.',
    },
    { role: 'user', content: prompt },
  ];

  const response = await ai.chat(messages, {
    temperature: 0.5,
    maxTokens: 4000,
  });

  return parseMindMapResponse(response, usedPages);
}

/**
 * Generate a mind map from a search query (uses RAG to find relevant content first).
 */
export async function generateMindMapFromQuery(
  query: string,
  userId: string
): Promise<MindMap> {
  const relevantChunks = await searchSimilarChunks(query, userId, 8);

  if (relevantChunks.length === 0) {
    throw new Error('No relevant content found. Upload a PDF first.');
  }

  let context = '';
  const usedPages: number[] = [];
  for (const chunk of relevantChunks) {
    context += `[${chunk.fileName}, Page ${chunk.pageNumber}]: ${chunk.text}\n\n`;
    if (!usedPages.includes(chunk.pageNumber)) {
      usedPages.push(chunk.pageNumber);
    }
  }

  const prompt = `Create a mind map about: "${query}"

Based on the following textbook content:

${context}

Generate a hierarchical mind map structure with:
1. A clear central topic as root.
2. 3-6 main branches (subtopics).
3. 2-5 leaf nodes per branch with key details.
4. Include page references.
5. Short labels (2-6 words), concise descriptions (1-2 sentences).

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "title": "Topic Title",
  "summary": "Brief overview",
  "rootNode": {
    "id": "root",
    "label": "Central Topic",
    "description": "Brief description",
    "children": [
      {
        "id": "1",
        "label": "Subtopic",
        "description": "Details",
        "sourcePage": 23,
        "children": [
          { "id": "1-1", "label": "Detail", "description": "Info", "sourcePage": 23, "children": [] }
        ]
      }
    ]
  }
}`;

  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an expert educational content organizer. Return ONLY valid JSON. No markdown.' },
    { role: 'user', content: prompt },
  ];

  const response = await ai.chat(messages, { temperature: 0.5, maxTokens: 4000 });

  return parseMindMapResponse(response, usedPages);
}

function parseMindMapResponse(raw: string, fallbackPages: number[]): MindMap {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find the JSON object
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Collect all source pages from nodes
    const sourcePages = new Set<number>(fallbackPages);
    function collectPages(node: any) {
      if (node.sourcePage) sourcePages.add(node.sourcePage);
      if (Array.isArray(node.children)) {
        node.children.forEach(collectPages);
      }
    }
    collectPages(parsed.rootNode);

    return {
      title: parsed.title || 'Mind Map',
      summary: parsed.summary || '',
      rootNode: validateNode(parsed.rootNode),
      sourcePages: Array.from(sourcePages).sort((a, b) => a - b),
    };
  } catch (err) {
    console.error('Failed to parse mind map response:', err);
    console.error('Raw response:', raw.substring(0, 500));
    throw new Error('AI returned invalid JSON for mind map. Please try again.');
  }
}

function validateNode(node: any, fallbackId: string = 'root'): MindMapNode {
  return {
    id: node.id || fallbackId,
    label: node.label || 'Untitled',
    description: node.description,
    sourcePage: node.sourcePage,
    children: Array.isArray(node.children)
      ? node.children.map((child: any, i: number) => validateNode(child, `${fallbackId}-${i}`))
      : [],
  };
}
