'use client';

import { useState, useEffect } from 'react';
import { healthCheck } from '@/lib/api';
import type { HealthResponse } from '@/lib/api';

export default function TestIntegration() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const checkBackend = async () => {
    setLoading(true);
    setError('');

    const response = await healthCheck();

    if (response.data) {
      setHealth(response.data);
    } else {
      setError(response.error || 'Failed to connect to backend');
    }

    setLoading(false);
  };

  useEffect(() => {
    checkBackend();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">
          🔌 Backend Integration Test
        </h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Backend Status</h2>
            <button
              onClick={checkBackend}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Checking...' : 'Refresh'}
            </button>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600">Connecting to backend...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="text-red-800 font-semibold">❌ Connection Failed</p>
              <p className="text-red-600 text-sm mt-2">{error}</p>
              <div className="mt-4 text-sm text-gray-700">
                <p className="font-semibold mb-2">Troubleshooting:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Is the backend server running on port 3001?</li>
                  <li>Check if you started it with: <code className="bg-gray-200 px-1 rounded">cd backend && npm run dev</code></li>
                  <li>Verify CORS settings in backend/src/index.ts</li>
                  <li>Check .env.local has NEXT_PUBLIC_API_URL=http://localhost:3001</li>
                </ul>
              </div>
            </div>
          )}

          {health && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <p className="text-green-800 font-semibold text-lg">
                  ✅ {health.status === 'ok' ? 'Backend Connected!' : 'Backend Status: ' + health.status}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded p-4">
                  <p className="text-sm text-gray-600 mb-1">Service</p>
                  <p className="font-semibold">{health.service}</p>
                </div>

                <div className="bg-gray-50 rounded p-4">
                  <p className="text-sm text-gray-600 mb-1">Model Provider</p>
                  <p className="font-semibold capitalize">{health.aiProvider}</p>
                </div>

                <div className="bg-gray-50 rounded p-4">
                  <p className="text-sm text-gray-600 mb-1">Database</p>
                  <p className="font-semibold">
                    {health.database === 'connected' ? (
                      <span className="text-green-600">✓ Connected</span>
                    ) : (
                      <span className="text-red-600">✗ Disconnected</span>
                    )}
                  </p>
                </div>

                <div className="bg-gray-50 rounded p-4">
                  <p className="text-sm text-gray-600 mb-1">pgvector</p>
                  <p className="font-semibold">
                    {health.pgvector ? (
                      <span className="text-green-600">✓ Available</span>
                    ) : (
                      <span className="text-yellow-600">✗ Not Available</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded p-4">
                <p className="text-sm text-gray-600 mb-1">Timestamp</p>
                <p className="font-mono text-sm">
                  {new Date(health.timestamp).toLocaleString()}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <p className="text-blue-800 text-sm">
                  <strong>Raw Response:</strong>
                </p>
                <pre className="mt-2 text-xs overflow-x-auto">
                  {JSON.stringify(health, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Frontend URL</span>
              <span className="font-mono text-sm">
                {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Backend API URL</span>
              <span className="font-mono text-sm">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Environment</span>
              <span className="font-mono text-sm">
                {process.env.NODE_ENV || 'development'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            See <a href="/INTEGRATION.md" className="text-blue-600 hover:underline">INTEGRATION.md</a> for full setup guide
          </p>
        </div>
      </div>
    </div>
  );
}
