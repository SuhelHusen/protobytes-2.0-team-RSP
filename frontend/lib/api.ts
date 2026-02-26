// ==========================================
// API Client for Backend Integration
// ==========================================

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

// Helper function to get auth token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('authToken');
}

// Generic fetch wrapper
async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.headers && typeof options.headers === 'object') {
    Object.assign(headers, options.headers);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || 'Request failed',
        status: response.status,
      };
    }

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

// ==========================================
// Auth API
// ==========================================

export interface SignupData {
  name: string;
  email: string;
  password: string;
  stream: 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT';
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    stream: 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT';
    created_at: string;
  };
}

export async function signup(data: SignupData): Promise<ApiResponse<AuthResponse>> {
  const response = await apiFetch<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (response.data?.token) {
    localStorage.setItem('authToken', response.data.token);
  }

  return response;
}

export async function login(data: LoginData): Promise<ApiResponse<AuthResponse>> {
  const response = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (response.data?.token) {
    localStorage.setItem('authToken', response.data.token);
  }

  return response;
}

export async function getMe(): Promise<ApiResponse> {
  return apiFetch('/api/auth/me');
}

export function logout() {
  localStorage.removeItem('authToken');
}

// ==========================================
// Upload API
// ==========================================

export async function uploadPDF(file: File): Promise<ApiResponse> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        error: data.error || 'Upload failed',
        status: response.status,
      };
    }

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

export async function getSources(): Promise<ApiResponse> {
  return apiFetch('/api/sources');
}

export async function deleteSource(sourceId: string): Promise<ApiResponse> {
  return apiFetch(`/api/sources/${sourceId}`, {
    method: 'DELETE',
  });
}

// ==========================================
// Chat API
// ==========================================

export interface ChatMessage {
  question: string;
  sourceId?: string;
}

export async function sendChatMessage(message: ChatMessage): Promise<ApiResponse> {
  return apiFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}

export async function getChatHistory(): Promise<ApiResponse> {
  return apiFetch('/api/chat/history');
}

// ==========================================
// MCQ API
// ==========================================

export interface GenerateMCQRequest {
  sourceId: string;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export async function generateMCQ(request: GenerateMCQRequest): Promise<ApiResponse> {
  return apiFetch('/api/generate-mcq', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getAllMCQs(): Promise<ApiResponse> {
  return apiFetch('/api/mcqs');
}

export async function getMCQsBySource(sourceId: string): Promise<ApiResponse> {
  return apiFetch(`/api/mcqs?sourceId=${sourceId}`);
}

// ==========================================
// Flashcard API
// ==========================================

export interface GenerateFlashcardsRequest {
  sourceId: string;
  count?: number;
}

export async function generateFlashcards(request: GenerateFlashcardsRequest): Promise<ApiResponse> {
  return apiFetch('/api/generate-flashcards', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getAllFlashcards(): Promise<ApiResponse> {
  return apiFetch('/api/flashcards');
}

export async function getFlashcardsBySource(sourceId: string): Promise<ApiResponse> {
  return apiFetch(`/api/flashcards?sourceId=${sourceId}`);
}

// ==========================================
// Mindmap API
// ==========================================

export interface GenerateMindmapRequest {
  sourceId: string;
  topic?: string;
}

export async function generateMindmap(request: GenerateMindmapRequest): Promise<ApiResponse> {
  return apiFetch('/api/generate-mindmap', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export async function getAllMindmaps(): Promise<ApiResponse> {
  return apiFetch('/api/mindmaps');
}

export async function getMindmapsBySource(sourceId: string): Promise<ApiResponse> {
  return apiFetch(`/api/mindmaps?sourceId=${sourceId}`);
}

// ==========================================
// Health Check
// ==========================================

export async function healthCheck(): Promise<ApiResponse> {
  return apiFetch('/api/health');
}
