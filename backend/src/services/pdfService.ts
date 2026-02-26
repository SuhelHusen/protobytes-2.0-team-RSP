// ==========================================
// PDF Text Extraction Service
// ==========================================
// Extracts text from PDF files with per-page tracking.

import fs from 'fs';
import pdf from 'pdf-parse';

export interface PageContent {
  pageNumber: number;
  text: string;
}

export interface PDFExtraction {
  fullText: string;
  pages: PageContent[];
  totalPages: number;
}

/**
 * Extract text from a PDF file, split by pages.
 * Uses form-feed characters (\f) to detect page breaks.
 */
export async function extractTextFromPDF(filePath: string): Promise<PDFExtraction> {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);

  const pages: PageContent[] = [];

  // pdf-parse separates pages with form-feed (\f)
  const rawPages = data.text.split(/\f/);

  for (let i = 0; i < rawPages.length; i++) {
    const pageText = rawPages[i].trim();
    if (pageText.length > 0) {
      pages.push({
        pageNumber: i + 1,
        text: pageText,
      });
    }
  }

  // Fallback: if no page breaks detected, treat whole text as page 1
  if (pages.length === 0 && data.text.trim().length > 0) {
    pages.push({ pageNumber: 1, text: data.text.trim() });
  }

  return {
    fullText: data.text,
    pages,
    totalPages: data.numpages,
  };
}
