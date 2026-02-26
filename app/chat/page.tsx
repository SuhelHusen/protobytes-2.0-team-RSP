"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  SendHorizonal,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import {
  Citation,
  Source,
  clearChatHistory,
  deleteSource,
  getChatHistory,
  getSources,
  sendChatMessage,
  uploadPDF,
} from "@/lib/api";

type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

type HistoryEntry = {
  id?: string;
  question?: string;
  answer?: string;
  citations?: unknown;
};

const promptChips = [
  "Explain Newton's first law in simple words.",
  "Summarize chapter 2 in 5 points.",
  "Generate revision notes for this topic.",
];

function citationKey(citation: Citation): string {
  return `${citation.sourceId}::${citation.pageNumber}`;
}

function normalizeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const unique: Citation[] = [];

  for (const citation of citations) {
    const key = citationKey(citation);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(citation);
  }

  return unique;
}

function normalizeAssistantContent(content: string): string {
  return content.replace(/\*\*/g, "").trim();
}

function parseHistoryItem(item: HistoryEntry): UIMessage[] {
  const citationsRaw = item?.citations;
  let parsedCitations: Citation[] = [];
  if (Array.isArray(citationsRaw)) parsedCitations = citationsRaw;
  if (typeof citationsRaw === "string") {
    try {
      parsedCitations = JSON.parse(citationsRaw);
    } catch {
      parsedCitations = [];
    }
  }

  return [
    {
      id: `${item.id}-q`,
      role: "user",
      content: item.question || "",
    },
    {
      id: `${item.id}-a`,
      role: "assistant",
      content: normalizeAssistantContent(item.answer || ""),
      citations: normalizeCitations(parsedCitations),
    },
  ];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [strictMode, setStrictMode] = useState(true);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [selectedCitationNumber, setSelectedCitationNumber] = useState<number | null>(null);
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [sourceResponse, historyResponse] = await Promise.all([
        getSources(),
        getChatHistory(20),
      ]);

      if (!active) return;

      if (sourceResponse.data?.sources) {
        setSources(sourceResponse.data.sources);
        if (sourceResponse.data.sources[0]) {
          setPreviewSourceId(sourceResponse.data.sources[0].id);
        }
      }

      if (historyResponse.data?.history) {
        const historyItems = historyResponse.data.history as HistoryEntry[];
        const restored = [...historyItems]
          .reverse()
          .flatMap(parseHistoryItem)
          .filter((item) => item.content);
        setMessages(restored);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const sourceCountLabel = useMemo(() => {
    if (sources.length === 0) return "No sources uploaded";
    if (sources.length === 1) return "1 source loaded";
    return `${sources.length} sources loaded`;
  }, [sources.length]);
  const previewSource = useMemo(
    () => sources.find((source) => source.id === previewSourceId) || null,
    [previewSourceId, sources]
  );
  const previewPdfUrl = useMemo(() => {
    if (!previewSource?.file_url) return "";
    const baseUrl = previewSource.file_url.split("#")[0];
    const page = selectedCitation?.sourceId === previewSource.id ? (previewPageNumber || 1) : 1;
    return `${baseUrl}#page=${page}&zoom=page-width`;
  }, [previewPageNumber, previewSource, selectedCitation?.sourceId]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || sending) return;
    setError("");
    setNotice("");

    const text = input.trim();
    const userMessage: UIMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSending(true);

    const response = await sendChatMessage({
      question: text,
      strictMode,
    });

    setSending(false);

    const chatData = response.data;
    if (response.error || !chatData) {
      setError(response.error || "Could not get assistant response.");
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "I could not process that right now. Please check backend connectivity and model key.",
        },
      ]);
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: normalizeAssistantContent(chatData.answer || "No answer generated."),
        citations: normalizeCitations(chatData.citations || []),
      },
    ]);
  }

  async function handleClearChat() {
    if (messages.length === 0 || clearingChat) return;
    const confirmed = window.confirm("Clear all chat messages and history?");
    if (!confirmed) return;

    setClearingChat(true);
    setError("");
    setNotice("");

    const response = await clearChatHistory();
    setClearingChat(false);
    if (response.error) {
      setError(response.error);
      return;
    }

    setMessages([]);
    setSelectedCitation(null);
    setSelectedCitationNumber(null);
    setPreviewPageNumber(null);
    setNotice("Chat history cleared.");
  }

  async function handleUpload(file: File | null) {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");

    const response = await uploadPDF(file);
    if (response.error) {
      setError(response.error);
      setUploading(false);
      return;
    }

    setNotice(`Uploaded ${file.name}`);
    const listResponse = await getSources();
    if (listResponse.data?.sources) {
      setSources(listResponse.data.sources);
      if (!previewSourceId && listResponse.data.sources[0]) {
        setPreviewSourceId(listResponse.data.sources[0].id);
      }
    }
    setUploading(false);
  }

  async function handleDeleteSource(sourceId: string) {
    const response = await deleteSource(sourceId);
    if (response.error) {
      setError(response.error);
      return;
    }
    setSources((current) => {
      const filtered = current.filter((source) => source.id !== sourceId);
      if (previewSourceId === sourceId) {
        setPreviewSourceId(filtered[0]?.id || null);
      }
      return filtered;
    });
    if (selectedCitation?.sourceId === sourceId) {
      setSelectedCitation(null);
      setSelectedCitationNumber(null);
      setPreviewPageNumber(null);
    }
  }

  return (
    <AppShell
      title="Notebook Chat Workspace"
      showPracticeTools
      sidebarContent={(
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_10px_24px_rgba(22,38,52,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                Source Upload
              </p>
              <p className="text-[11px] text-[var(--ink-soft)]">{sourceCountLabel}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-[var(--line-strong)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
              <Upload size={12} />
              {uploading ? "Uploading..." : "Upload PDF"}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleUpload(file);
                }}
              />
            </label>
          </div>

          {notice ? (
            <p className="mt-2 rounded-lg bg-[#e8f7f0] px-2 py-1 text-xs text-[#1f8f5f]">{notice}</p>
          ) : null}
          {error ? (
            <p className="mt-2 rounded-lg bg-[#ffe8ed] px-2 py-1 text-xs text-[#b6344c]">{error}</p>
          ) : null}

          <div className="mt-3 max-h-[330px] space-y-2 overflow-y-auto pr-1">
            {sources.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line)] px-2 py-2 text-[11px] text-[var(--ink-soft)]">
                Upload your first PDF.
              </p>
            ) : (
              sources.map((source) => (
                <div
                  key={source.id}
                  className={`rounded-xl border px-2.5 py-2 ${
                    previewSourceId === source.id
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]/40"
                      : "border-[var(--line)] bg-[#fbfdfe]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewSourceId(source.id);
                      setPreviewPageNumber(null);
                    }}
                    className="w-full text-left"
                  >
                    <p className="line-clamp-2 text-xs font-semibold text-[var(--ink)]">
                      {source.file_name}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--ink-soft)]">{source.total_pages} pages</p>
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <a
                      href={source.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] hover:underline"
                    >
                      <FileText size={12} />
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSource(source.id)}
                      className="text-[var(--ink-soft)] hover:text-[var(--danger)]"
                      title="Delete source"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    >
      <div className="grid h-[calc(100vh-200px)] min-h-[620px] gap-4 lg:grid-cols-[1.35fr_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_10px_25px_rgba(20,38,52,0.07)]">
          <div className="border-b border-[var(--line)] bg-[#fbfdfe] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">Source PDF Viewer</h3>
                <p className="text-xs text-[var(--ink-soft)]">{sourceCountLabel}</p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-3">
            {previewSource?.file_url ? (
              <div className="flex h-full min-h-[380px] flex-col gap-2">
                {selectedCitation && selectedCitation.sourceId === previewSource.id ? (
                  <div className="rounded-xl border border-[#bfd0ff] bg-[#edf2ff] px-3 py-2 text-xs text-[#2d43cc]">
                    Focused Reference {selectedCitationNumber ? `[${selectedCitationNumber}]` : ""}: page{" "}
                    {selectedCitation.pageNumber}. PDF jumped to this citation.
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#f9fbff] px-2.5 py-1.5">
                  <p className="truncate pr-2 text-xs font-semibold text-[var(--ink)]">
                    {previewSource.file_name}
                  </p>
                  <a
                    href={previewSource.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--primary)] hover:underline"
                  >
                    Open tab
                    <ExternalLink size={12} />
                  </a>
                </div>
                <iframe
                  title="Source PDF Preview"
                  src={previewPdfUrl}
                  className={`h-full w-full rounded-xl border bg-white ${
                    selectedCitation && selectedCitation.sourceId === previewSource.id
                      ? "border-[var(--primary)] shadow-[0_0_0_2px_rgba(45,67,204,0.18)]"
                      : "border-[var(--line)]"
                  }`}
                />
              </div>
            ) : (
              <div className="grid h-full min-h-[380px] place-items-center rounded-xl border border-dashed border-[var(--line)] bg-[var(--card)] p-3 text-xs text-[var(--ink-soft)]">
                Select a source from the right panel to view PDF side-by-side while chatting.
              </div>
            )}
          </div>

          <div className="border-t border-[var(--line)] p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
              Citation Preview
            </h4>
            {selectedCitation ? (
              <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[#f9fbff] p-3">
                <p className="text-xs font-semibold text-[var(--primary)]">
                  {selectedCitationNumber ? `[${selectedCitationNumber}] ` : ""}
                  {selectedCitation.fileName} · page {selectedCitation.pageNumber}
                </p>
                <p className="max-h-24 overflow-auto text-xs leading-relaxed text-[var(--ink)]">
                  {selectedCitation.text}
                </p>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-xs text-[var(--ink-soft)]">
                Select a citation to inspect source text.
              </p>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_10px_25px_rgba(20,38,52,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[#fbfdfe] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Study Chat</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStrictMode((value) => !value)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                  strictMode
                    ? "bg-[#e8f7f0] text-[#1f8f5f]"
                    : "bg-[#fff4dd] text-[#845710]"
                }`}
              >
                {strictMode ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                {strictMode ? "Strict Mode" : "Relaxed Mode"}
              </button>
              <button
                type="button"
                onClick={() => void handleClearChat()}
                disabled={messages.length === 0 || clearingChat}
                className="inline-flex items-center gap-1 rounded-full border border-[#f1c4cd] bg-[#fff2f5] px-3 py-1 text-xs font-semibold text-[#b6344c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clearingChat ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Clear Chat
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="mt-8 space-y-4 text-center">
                <p className="text-sm text-[var(--ink-soft)]">
                  Ask your first question. Upload at least one PDF for best results.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {promptChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setInput(chip)}
                      className="rounded-full border border-[var(--line)] bg-[#fbfdfe] px-3 py-1 text-xs text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((message) => {
              const normalizedMessageCitations = normalizeCitations(message.citations || []);
              const messageContent =
                message.role === "assistant"
                  ? normalizeAssistantContent(message.content)
                  : message.content;

              return (
                <article
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    message.role === "user"
                      ? "ml-auto bg-[var(--primary)] text-white"
                      : "border border-[var(--line)] bg-white text-[var(--ink)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{messageContent}</p>

                  {message.role === "assistant" && normalizedMessageCitations.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-2">
                      {normalizedMessageCitations.map((citation, index) => (
                        <button
                          key={`${message.id}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedCitation(citation);
                            setSelectedCitationNumber(index + 1);
                            setPreviewSourceId(citation.sourceId);
                            setPreviewPageNumber(citation.pageNumber);
                          }}
                          title={`${citation.fileName} (Page ${citation.pageNumber})`}
                          className="rounded-full border border-[#c8d4ff] bg-[#edf1ff] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary)] hover:brightness-95"
                        >
                          [{index + 1}] p{citation.pageNumber}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {sending ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink-soft)]">
                <Loader2 size={14} className="animate-spin" />
                Thinking...
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-[var(--line)] bg-[#fbfdfe] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Ask from your sources..."
                className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--primary)]"
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizonal size={16} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
