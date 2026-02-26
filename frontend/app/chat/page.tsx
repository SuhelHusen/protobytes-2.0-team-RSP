export default function ChatPage() {
    return (
      <div className="flex h-full gap-6">
        {/* Chat Area */}
        <div className="flex-1 bg-white rounded shadow p-4 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <p className="mb-2">
              <strong>AI:</strong> Ask me anything from your uploaded sources.
            </p>
          </div>
  
          <input
            className="border rounded p-2 mt-4"
            placeholder="Ask a question..."
          />
        </div>
  
        {/* Sources Panel */}
        <div className="w-64 bg-white rounded shadow p-4">
          <h3 className="font-semibold mb-3">📄 Sources</h3>
          <p className="text-sm text-gray-500">
            No sources uploaded yet
          </p>
        </div>
      </div>
    );
  }
  