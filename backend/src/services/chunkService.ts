// ==========================================
// Text Chunking Service
// ==========================================
// Splits extracted PDF text into overlapping chunks
// while preserving page number references.

export interface Chunk {
  text: string;
  pageNumber: number;
  chunkIndex: number;
  sourceId: string;
}

const DEFAULT_CHUNK_SIZE = 600;    // characters per chunk
const DEFAULT_CHUNK_OVERLAP = 120; // overlap between chunks
const MAX_TOTAL_CHUNKS = 2000;     // hard safety cap to prevent OOM
const MAX_PAGE_TEXT_CHARS = 200_000;
const MAX_ITERATIONS_PER_PAGE = 10_000;

/**
 * Split page-level text into smaller overlapping chunks.
 * Tries to break at sentence boundaries for better context.
 */
export function chunkText(
  pages: { pageNumber: number; text: string }[],
  sourceId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP
): Chunk[] {
  const chunks: Chunk[] = [];
  let globalIndex = 0;
  const safeChunkSize = Math.max(100, chunkSize);
  const safeChunkOverlap = Math.min(Math.max(0, chunkOverlap), safeChunkSize - 1);

  for (const page of pages) {
    if (chunks.length >= MAX_TOTAL_CHUNKS) break;

    let text = page.text ?? '';
    if (text.length > MAX_PAGE_TEXT_CHARS) {
      console.warn(
        `⚠️  Page ${page.pageNumber} text too large (${text.length} chars); truncating to ${MAX_PAGE_TEXT_CHARS} chars`
      );
      text = text.slice(0, MAX_PAGE_TEXT_CHARS);
    }

    // Small enough to be one chunk
    if (text.length <= safeChunkSize) {
      if (text.trim().length > 20) {
        // skip tiny fragments
        chunks.push({
          text: text.trim(),
          pageNumber: page.pageNumber,
          chunkIndex: globalIndex++,
          sourceId,
        });
      }
      continue;
    }

    // Split into overlapping chunks with sentence-boundary awareness
    let start = 0;
    let iterations = 0;
    while (start < text.length && iterations < MAX_ITERATIONS_PER_PAGE) {
      iterations += 1;
      if (chunks.length >= MAX_TOTAL_CHUNKS) break;

      let end = Math.min(start + safeChunkSize, text.length);

      // Try to break at a sentence boundary (. ? ! \n)
      if (end < text.length) {
        const pivot = start + Math.floor(safeChunkSize * 0.5);
        const searchRegion = text.substring(pivot, end);
        const lastSentenceEnd = Math.max(
          searchRegion.lastIndexOf('. '),
          searchRegion.lastIndexOf('.\n'),
          searchRegion.lastIndexOf('? '),
          searchRegion.lastIndexOf('! '),
          searchRegion.lastIndexOf('\n\n')
        );
        if (lastSentenceEnd > 0) {
          end = pivot + lastSentenceEnd + 1;
        }
      }

      // Guard against non-progress loops
      if (end <= start) {
        end = Math.min(start + safeChunkSize, text.length);
        if (end <= start) break;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 20) {
        chunks.push({
          text: chunkText,
          pageNumber: page.pageNumber,
          chunkIndex: globalIndex++,
          sourceId,
        });
      }

      // Advance with overlap
      let nextStart = end - safeChunkOverlap;
      if (nextStart <= start) {
        nextStart = start + Math.max(1, safeChunkSize - safeChunkOverlap);
      }
      start = nextStart;
      if (start >= text.length - 30) break; // don't create tiny trailing chunks
    }

    if (iterations >= MAX_ITERATIONS_PER_PAGE) {
      console.warn(`⚠️  Chunk loop safety limit reached on page ${page.pageNumber}; stopping early.`);
    }
  }

  if (chunks.length >= MAX_TOTAL_CHUNKS) {
    console.warn(`⚠️  Chunk cap reached (${MAX_TOTAL_CHUNKS}). Remaining text was skipped.`);
  }

  return chunks;
}
