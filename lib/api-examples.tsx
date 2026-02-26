// ==========================================
// Example: Using the API Client
// ==========================================
// This file demonstrates how to use the API client in your components
// Copy and adapt these patterns for your pages

// @ts-nocheck
'use client';

import { useState } from 'react';
import {
  login,
  signup,
  uploadPDF,
  getSources,
  sendChatMessage,
  generateMCQ,
  generateFlashcards,
  generateMindmap,
  healthCheck,
} from '@/lib/api';
import type {
  User,
  Source,
  ChatMessage,
  MCQ,
  Flashcard,
  Mindmap,
} from '@/lib/types';

// ==========================================
// Example 1: Login Form
// ==========================================
export function LoginExample() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const response = await login({ email, password });

    if (response.data) {
      setUser(response.data.user);
      console.log('Logged in:', response.data.user);
      // Redirect to dashboard
      // router.push('/dashboard');
    } else {
      setError(response.error || 'Login failed');
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="border rounded p-2 w-full"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="border rounded p-2 w-full"
        required
      />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}

// ==========================================
// Example 2: Signup Form
// ==========================================
export function SignupExample() {
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    password: string;
    stream: 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT';
  }>({
    name: '',
    email: '',
    password: '',
    stream: 'SEE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const response = await signup(formData);

    if (response.data) {
      console.log('Signed up:', response.data.user);
      // Redirect to dashboard
    } else {
      setError(response.error || 'Signup failed');
    }

    setLoading(false);
  };

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <input
        type="text"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Full Name"
        className="border rounded p-2 w-full"
        required
      />
      <input
        type="email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        placeholder="Email"
        className="border rounded p-2 w-full"
        required
      />
      <input
        type="password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        placeholder="Password (min 6 chars)"
        className="border rounded p-2 w-full"
        required
        minLength={6}
      />
      <select
        value={formData.stream}
        onChange={(e) =>
          setFormData({
            ...formData,
            stream: e.target.value as 'SEE' | 'PLUS2_SCIENCE' | 'PLUS2_MANAGEMENT',
          })
        }
        className="border rounded p-2 w-full"
      >
        <option value="SEE">SEE</option>
        <option value="PLUS2_SCIENCE">+2 Science</option>
        <option value="PLUS2_MANAGEMENT">+2 Management</option>
      </select>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  );
}

// ==========================================
// Example 3: PDF Upload
// ==========================================
export function UploadExample() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setMessage('');

    const response = await uploadPDF(file);

    if (response.data) {
      setMessage(`✅ Uploaded: ${response.data.source.file_name}`);
      setFile(null);
    } else {
      setMessage(`❌ Error: ${response.error}`);
    }

    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept=".pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="border rounded p-2"
      />
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-purple-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {uploading ? 'Uploading...' : 'Upload PDF'}
      </button>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}

// ==========================================
// Example 4: List Sources
// ==========================================
export function SourcesListExample() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSources = async () => {
    setLoading(true);
    const response = await getSources();

    if (response.data) {
      setSources(response.data.sources);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={loadSources}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Load Sources
      </button>

      {loading && <p>Loading...</p>}

      <ul className="space-y-2">
        {sources.map((source) => (
          <li key={source.id} className="border rounded p-3">
            <p className="font-semibold">{source.file_name}</p>
            <p className="text-sm text-gray-600">
              Pages: {source.total_pages} | Uploaded:{' '}
              {new Date(source.uploaded_at).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==========================================
// Example 5: Chat Interface
// ==========================================
export function ChatExample() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer('');

    const response = await sendChatMessage({ question });

    if (response.data) {
      setAnswer(response.data.answer);
    } else {
      setAnswer(`Error: ${response.error}`);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask a question..."
        className="border rounded p-2 w-full"
        onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
      />
      <button
        onClick={handleAsk}
        disabled={loading}
        className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Asking...' : 'Ask'}
      </button>

      {answer && (
        <div className="bg-gray-100 p-4 rounded">
          <p className="font-semibold">Answer:</p>
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Example 6: Generate MCQs
// ==========================================
export function GenerateMCQExample({ sourceId }: { sourceId: string }) {
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);

    const response = await generateMCQ({
      sourceId,
      count: 5,
      difficulty: 'medium',
    });

    if (response.data) {
      setMcqs(response.data.mcqs);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="bg-orange-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Generating...' : 'Generate 5 MCQs'}
      </button>

      <div className="space-y-4">
        {mcqs.map((mcq, index) => (
          <div key={mcq.id} className="border rounded p-4">
            <p className="font-semibold mb-2">
              {index + 1}. {mcq.question}
            </p>
            <ul className="space-y-1 ml-4">
              {mcq.options.map((opt, i) => (
                <li
                  key={i}
                  className={opt.isCorrect ? 'text-green-600 font-semibold' : ''}
                >
                  {String.fromCharCode(65 + i)}. {opt.option}
                  {opt.isCorrect && ' ✓'}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// Example 7: Health Check
// ==========================================
export function HealthCheckExample() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    const response = await healthCheck();

    if (response.data) {
      setStatus(response.data);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={checkHealth}
        className="bg-gray-500 text-white px-4 py-2 rounded"
      >
        Check Backend Status
      </button>

      {loading && <p>Checking...</p>}

      {status && (
        <div className="bg-gray-100 p-4 rounded">
          <pre className="text-sm">{JSON.stringify(status, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
