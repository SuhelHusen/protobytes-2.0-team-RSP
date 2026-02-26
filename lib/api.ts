// ==========================================
// API Client for Backend Integration
// ==========================================

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_URL = RAW_API_URL.replace(/\/+$/, "");

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("authToken");
}

function saveAuth(token: string, user: AuthResponse["user"]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("authToken", token);
  localStorage.setItem("authUser", JSON.stringify(user));
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  if (typeof maybe.error === "string" && maybe.error.trim()) return maybe.error;
  if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
  return null;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function buildApiUrl(endpoint: string): string {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const endpointWithApi = normalizedEndpoint.startsWith("/api")
    ? normalizedEndpoint
    : `/api${normalizedEndpoint}`;

  // Support both NEXT_PUBLIC_API_URL=http://host:3001 and http://host:3001/api
  if (API_URL.endsWith("/api")) {
    return `${API_URL}${endpointWithApi.slice(4)}`;
  }
  return `${API_URL}${endpointWithApi}`;
}

async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.headers && typeof options.headers === "object") {
    Object.assign(headers, options.headers);
  }

  try {
    const response = await fetch(buildApiUrl(endpoint), {
      ...options,
      headers,
      credentials: "include",
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      const errorMessage = readErrorMessage(data) || `Request failed with status ${response.status}`;
      return {
        error: errorMessage,
        status: response.status,
      };
    }

    return {
      data: data as T,
      status: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    const networkFailure = /failed to fetch|networkerror|load failed|fetch/i.test(message);
    return {
      error: networkFailure
        ? `${message}. Cannot reach backend at ${buildApiUrl(endpoint)}`
        : message,
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
  stream: "SEE" | "PLUS2_SCIENCE" | "PLUS2_MANAGEMENT";
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
    stream: "SEE" | "PLUS2_SCIENCE" | "PLUS2_MANAGEMENT";
    created_at?: string;
  };
}

export async function signup(data: SignupData): Promise<ApiResponse<AuthResponse>> {
  const response = await apiFetch<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (response.data?.token) {
    saveAuth(response.data.token, response.data.user);
  }

  return response;
}

export async function login(data: LoginData): Promise<ApiResponse<AuthResponse>> {
  const response = await apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (response.data?.token) {
    saveAuth(response.data.token, response.data.user);
  }

  return response;
}

export async function getMe(): Promise<ApiResponse<{ user: AuthResponse["user"] }>> {
  return apiFetch("/api/auth/me");
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("authToken");
  localStorage.removeItem("authUser");
}

// ==========================================
// Upload + Source API
// ==========================================

export interface Source {
  id: string;
  file_name: string;
  total_pages: number;
  file_url?: string;
  created_at?: string;
}

export async function uploadPDF(file: File): Promise<ApiResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/api/upload", {
    method: "POST",
    body: formData,
  });
}

export async function getSources(): Promise<ApiResponse<{ sources: Source[] }>> {
  return apiFetch("/api/sources");
}

export async function deleteSource(sourceId: string): Promise<ApiResponse> {
  return apiFetch(`/api/sources/${sourceId}`, {
    method: "DELETE",
  });
}

// ==========================================
// Chat API
// ==========================================

export interface Citation {
  fileName: string;
  pageNumber: number;
  text: string;
  sourceId: string;
}

export interface ChatRequest {
  question: string;
  strictMode?: boolean;
}

export interface ChatReply {
  answer: string;
  citations: Citation[];
  strictMode?: boolean;
}

export async function sendChatMessage(message: ChatRequest): Promise<ApiResponse<ChatReply>> {
  return apiFetch("/api/chat", {
    method: "POST",
    body: JSON.stringify(message),
  });
}

export async function getChatHistory(limit = 20): Promise<ApiResponse<{ history: unknown[] }>> {
  return apiFetch(`/api/chat/history?limit=${limit}`);
}

export async function clearChatHistory(): Promise<ApiResponse<{ success: boolean; deleted: number }>> {
  return apiFetch("/api/chat/history", {
    method: "DELETE",
  });
}

// ==========================================
// Planner API
// ==========================================

export type TaskStatus = "TODO" | "DOING" | "PROCRASTINATED" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface StudyTask {
  id: string;
  title: string;
  description?: string;
  subject: string;
  deadline: string | null;
  status: TaskStatus;
  ai_generated?: boolean;
  priority: TaskPriority;
  created_at?: string;
}

export interface TaskStats {
  total: number;
  todo: number;
  doing: number;
  procrastinated: number;
  done: number;
  completedToday: number;
  overdue: number;
  todayTasks: StudyTask[];
  subjectBreakdown: Array<{ subject: string; status: TaskStatus; count: number }>;
}

export async function getTasks(): Promise<ApiResponse<{ tasks: StudyTask[] }>> {
  return apiFetch("/api/tasks");
}

export async function createTask(task: Partial<StudyTask>): Promise<ApiResponse<{ task: StudyTask }>> {
  return apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<ApiResponse<{ task: StudyTask }>> {
  return apiFetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getTaskStats(): Promise<ApiResponse<TaskStats>> {
  return apiFetch("/api/tasks/stats");
}

export async function generateSchedule(payload: {
  examDate: string;
  hoursPerDay: number;
  weakSubjects: string[];
}): Promise<ApiResponse> {
  return apiFetch("/api/schedule/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ==========================================
// MCQ API
// ==========================================

export async function generateMCQ(request: {
  sourceId: string;
  numberOfQuestions?: number;
  chapter?: string;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
}): Promise<ApiResponse> {
  return apiFetch("/api/generate-mcq", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAllMCQs(): Promise<ApiResponse<{ mcqSets: unknown[] }>> {
  return apiFetch("/api/mcqs");
}

export async function getMCQsBySource(sourceId: string): Promise<ApiResponse<{ mcqSets: unknown[] }>> {
  return apiFetch(`/api/mcqs?sourceId=${sourceId}`);
}

// ==========================================
// Flashcard API
// ==========================================

export async function generateFlashcards(request: {
  sourceId: string;
  count?: number;
  topic?: string;
}): Promise<ApiResponse> {
  return apiFetch("/api/generate-flashcards", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAllFlashcards(): Promise<ApiResponse<{ flashcardSets: unknown[] }>> {
  return apiFetch("/api/flashcards");
}

export async function getFlashcardsBySource(
  sourceId: string
): Promise<ApiResponse<{ flashcardSets: unknown[] }>> {
  return apiFetch(`/api/flashcards?sourceId=${sourceId}`);
}

// ==========================================
// Mindmap API
// ==========================================

export async function generateMindmap(request: {
  sourceId: string;
  topic?: string;
}): Promise<ApiResponse> {
  return apiFetch("/api/generate-mindmap", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getAllMindmaps(): Promise<ApiResponse<{ mindmaps: unknown[] }>> {
  return apiFetch("/api/mindmaps");
}

// ==========================================
// Health Check
// ==========================================

export interface HealthResponse {
  status: string;
  service: string;
  aiProvider: string;
  database: string;
  pgvector: boolean;
  timestamp: string;
}

export async function healthCheck(): Promise<ApiResponse<HealthResponse>> {
  return apiFetch("/api/health");
}
