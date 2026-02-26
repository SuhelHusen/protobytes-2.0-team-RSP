// ==========================================
// TypeScript Types for API Responses
// ==========================================

// User & Auth Types
export interface User {
  id: string;
  name: string;
  email: string;
  stream: 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT';
  created_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Source Types
export interface Source {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_url?: string;
  content?: string;
  total_pages: number;
  uploaded_at: string;
}

export interface UploadResponse {
  message: string;
  source: Source;
  chunksStored: number;
}

// Chat Types
export interface ChatMessage {
  id: string;
  user_id: string;
  source_id: string | null;
  question: string;
  answer: string;
  created_at: string;
}

export interface ChatResponse {
  answer: string;
  sources?: Array<{
    chunk: string;
    similarity: number;
    metadata?: any;
  }>;
}

// MCQ Types
export interface MCQOption {
  option: string;
  isCorrect: boolean;
}

export interface MCQ {
  id: string;
  user_id: string;
  source_id: string;
  question: string;
  options: MCQOption[];
  explanation?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  created_at: string;
}

export interface GenerateMCQResponse {
  message: string;
  count: number;
  mcqs: MCQ[];
}

// Flashcard Types
export interface Flashcard {
  id: string;
  user_id: string;
  source_id: string;
  front: string;
  back: string;
  created_at: string;
}

export interface GenerateFlashcardsResponse {
  message: string;
  count: number;
  flashcards: Flashcard[];
}

// Mindmap Types
export interface MindmapNode {
  id: string;
  label: string;
  children?: MindmapNode[];
}

export interface Mindmap {
  id: string;
  user_id: string;
  source_id: string;
  topic: string;
  tree: MindmapNode;
  created_at: string;
}

export interface GenerateMindmapResponse {
  message: string;
  mindmap: Mindmap;
}

// Health Check Type
export interface HealthResponse {
  status: string;
  service: string;
  aiProvider: string;
  database: string;
  pgvector: boolean;
  timestamp: string;
}

// API Error Type
export interface ApiError {
  error: string;
  details?: any;
}
