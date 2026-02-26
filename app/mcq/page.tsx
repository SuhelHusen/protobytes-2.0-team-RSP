"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import BottomToast from "@/components/ui/BottomToast";
import { Source, generateMCQ, getAllMCQs, getSources } from "@/lib/api";
import { useTransientToast } from "@/lib/useTransientToast";

type MCQItem = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sourcePage?: number;
  difficulty?: string;
};

const fallbackMCQs: MCQItem[] = [
  {
    question: "Which law explains why passengers move forward when a bus suddenly stops?",
    options: [
      "A) Newton's First Law",
      "B) Newton's Second Law",
      "C) Newton's Third Law",
      "D) Law of Gravitation",
    ],
    correctAnswer: "A",
    explanation: "Inertia keeps the passenger moving in the same state of motion.",
    sourcePage: 14,
    difficulty: "easy",
  },
];

function parseMCQs(raw: unknown): MCQItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as MCQItem[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as MCQItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function MCQPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [count, setCount] = useState(10);
  const [mcqs, setMcqs] = useState<MCQItem[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const { toast, showToast } = useTransientToast();

  useEffect(() => {
    let active = true;
    (async () => {
      const sourceResponse = await getSources();
      if (!active) return;
      if (sourceResponse.data?.sources) {
        setSources(sourceResponse.data.sources);
        if (sourceResponse.data.sources[0]) {
          setSelectedSource(sourceResponse.data.sources[0].id);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function loadLatestSet() {
    setLoadingPrevious(true);
    const response = await getAllMCQs();
    setLoadingPrevious(false);

    const firstSet = response.data?.mcqSets?.[0] as { mcqs?: unknown } | undefined;
    const parsed = parseMCQs(firstSet?.mcqs);
    if (parsed.length > 0) {
      setMcqs(parsed);
      setSelectedAnswers({});
      setShowResult({});
      showToast("Loaded latest MCQ set.", "info");
      return;
    }

    if (response.error) {
      showToast(response.error, "error");
      return;
    }

    showToast("No previous MCQ set found.", "info");
  }

  async function generate() {
    if (!selectedSource) {
      showToast("Select a source first.", "error");
      return;
    }
    setLoading(true);

    const response = await generateMCQ({
      sourceId: selectedSource,
      numberOfQuestions: count,
      difficulty: "mixed",
    });
    setLoading(false);

    const payload = response.data as { mcqs?: MCQItem[] } | undefined;
    if (Array.isArray(payload?.mcqs)) {
      setMcqs(payload.mcqs);
      setSelectedAnswers({});
      setShowResult({});
      return;
    }

    if (response.error) {
      setMcqs(fallbackMCQs);
      showToast(`${response.error}. Showing sample MCQs.`, "error");
    }
  }

  const score = useMemo(() => {
    return mcqs.reduce((acc, mcq, index) => {
      const selected = selectedAnswers[index];
      if (!selected) return acc;
      return selected === mcq.correctAnswer ? acc + 1 : acc;
    }, 0);
  }, [mcqs, selectedAnswers]);
  const selectedSourceName = useMemo(() => {
    return sources.find((source) => source.id === selectedSource)?.file_name || "No source selected";
  }, [selectedSource, sources]);

  return (
    <AppShell
      title="MCQ Practice"
      sidebarContent={(
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_10px_24px_rgba(22,38,52,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Practice Summary
          </p>
          <div className="mt-2 space-y-2 text-xs">
            <div className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] p-2.5">
              <p className="text-[11px] text-[var(--ink-soft)]">Current source</p>
              <p className="mt-1 line-clamp-2 font-semibold text-[var(--ink)]">{selectedSourceName}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--line)] bg-white p-2 text-center">
                <p className="text-[11px] text-[var(--ink-soft)]">Questions</p>
                <p className="text-sm font-semibold text-[var(--ink)]">{mcqs.length || count}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-2 text-center">
                <p className="text-[11px] text-[var(--ink-soft)]">Score</p>
                <p className="text-sm font-semibold text-[var(--primary)]">
                  {score}/{mcqs.length || 0}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(20,38,52,0.07)]">
          <div className="grid gap-3 md:grid-cols-[1.5fr_0.5fr_0.7fr_auto_auto]">
            <select
              value={selectedSource}
              onChange={(event) => setSelectedSource(event.target.value)}
              className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            >
              <option value="">Select source...</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.file_name}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={3}
              max={30}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />

            <button
              type="button"
              onClick={() => void generate()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <BookOpenCheck size={15} />}
              Generate
            </button>

            <button
              type="button"
              onClick={() => void loadLatestSet()}
              disabled={loadingPrevious}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink-soft)]"
            >
              {loadingPrevious ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Load Latest
            </button>

            <div className="grid place-items-center rounded-xl bg-[#edf2ff] px-3 py-2 text-sm font-semibold text-[var(--primary)]">
              Score {score}/{mcqs.length || 0}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {mcqs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-white p-6 text-center text-sm text-[var(--ink-soft)]">
              Generate MCQs from a selected source to start practice.
            </div>
          ) : (
            mcqs.map((mcq, index) => {
              const selected = selectedAnswers[index];
              const revealed = showResult[index];
              return (
                <article
                  key={`${mcq.question}-${index}`}
                  className="rounded-2xl border border-[var(--line)] bg-white p-4 shadow-[0_10px_20px_rgba(20,38,52,0.06)]"
                >
                  <p className="text-xs text-[var(--ink-soft)]">Question {index + 1}</p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--ink)]">{mcq.question}</h3>

                  <div className="mt-3 space-y-2">
                    {mcq.options.map((option) => {
                      const letter = option.charAt(0);
                      const isCorrect = letter === mcq.correctAnswer;
                      const isSelected = selected === letter;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            if (revealed) return;
                            setSelectedAnswers((current) => ({ ...current, [index]: letter }));
                            setShowResult((current) => ({ ...current, [index]: true }));
                          }}
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                            !revealed
                              ? "border-[var(--line)] bg-[#fbfdfe] hover:border-[var(--primary)]"
                              : isCorrect
                                ? "border-[#1f8f5f] bg-[#e8f7f0] text-[#186e48]"
                                : isSelected
                                  ? "border-[#cf425b] bg-[#ffe8ed] text-[#b6344c]"
                                  : "border-[var(--line)] bg-[#f5f8fa] text-[var(--ink-soft)]"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {revealed ? (
                    <div className="mt-3 rounded-xl border border-[#b9dbcb] bg-[#eef9f3] px-3 py-2 text-sm text-[#15533a]">
                      <p className="inline-flex items-center gap-1 font-semibold">
                        <CheckCircle2 size={14} />
                        Correct: {mcq.correctAnswer}
                      </p>
                      <p className="mt-1">{mcq.explanation}</p>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
      <BottomToast toast={toast} />
    </AppShell>
  );
}
