"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Layers2, Loader2, RotateCcw } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import BottomToast from "@/components/ui/BottomToast";
import { Source, generateFlashcards, getAllFlashcards, getSources } from "@/lib/api";
import { useTransientToast } from "@/lib/useTransientToast";

type FlashcardItem = {
  front: string;
  back: string;
  sourcePage?: number;
  category?: string;
};

const fallbackCards: FlashcardItem[] = [
  {
    front: "What is osmosis?",
    back: "Osmosis is the movement of water molecules from high water concentration to low water concentration through a semi-permeable membrane.",
    sourcePage: 16,
    category: "concept",
  },
];

function parseCards(raw: unknown): FlashcardItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as FlashcardItem[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as FlashcardItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function FlashcardsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(15);
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const { toast, showToast } = useTransientToast();

  useEffect(() => {
    let active = true;
    (async () => {
      const response = await getSources();
      if (!active) return;
      if (response.data?.sources) {
        setSources(response.data.sources);
        if (response.data.sources[0]) {
          setSelectedSource(response.data.sources[0].id);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function loadLatestSet() {
    setLoadingPrevious(true);
    const response = await getAllFlashcards();
    setLoadingPrevious(false);

    const firstSet = response.data?.flashcardSets?.[0] as
      | { flashcards?: unknown }
      | undefined;
    const parsed = parseCards(firstSet?.flashcards);
    if (parsed.length > 0) {
      setCards(parsed);
      setIndex(0);
      setFlipped(false);
      showToast("Loaded latest flashcard set.", "info");
      return;
    }

    if (response.error) {
      showToast(response.error, "error");
      return;
    }

    showToast("No previous flashcard set found.", "info");
  }

  async function generate() {
    if (!selectedSource) {
      showToast("Select a source first.", "error");
      return;
    }
    setLoading(true);

    const response = await generateFlashcards({
      sourceId: selectedSource,
      count,
      topic: topic.trim() || undefined,
    });
    setLoading(false);

    const payload = response.data as { flashcards?: FlashcardItem[] } | undefined;
    if (Array.isArray(payload?.flashcards)) {
      setCards(payload.flashcards);
      setIndex(0);
      setFlipped(false);
      return;
    }

    if (response.error) {
      setCards(fallbackCards);
      setIndex(0);
      setFlipped(false);
      showToast(`${response.error}. Showing sample flashcards.`, "error");
    }
  }

  const currentCard = cards[index];
  const progress = useMemo(() => {
    if (cards.length === 0) return 0;
    return Math.round(((index + 1) / cards.length) * 100);
  }, [cards.length, index]);
  const selectedSourceName = useMemo(() => {
    return sources.find((source) => source.id === selectedSource)?.file_name || "No source selected";
  }, [selectedSource, sources]);

  return (
    <AppShell
      title="Flashcards"
      sidebarContent={(
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_10px_24px_rgba(22,38,52,0.08)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Card Summary
          </p>
          <div className="mt-2 space-y-2 text-xs">
            <div className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] p-2.5">
              <p className="text-[11px] text-[var(--ink-soft)]">Current source</p>
              <p className="mt-1 line-clamp-2 font-semibold text-[var(--ink)]">{selectedSourceName}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--line)] bg-white p-2 text-center">
                <p className="text-[11px] text-[var(--ink-soft)]">Cards</p>
                <p className="text-sm font-semibold text-[var(--ink)]">{cards.length || count}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white p-2 text-center">
                <p className="text-[11px] text-[var(--ink-soft)]">Progress</p>
                <p className="text-sm font-semibold text-[var(--primary)]">{progress}%</p>
              </div>
            </div>
          </div>
        </section>
      )}
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(20,38,52,0.07)]">
          <div className="grid gap-3 md:grid-cols-[1.3fr_0.8fr_0.4fr_auto_auto]">
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
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic (optional)"
              className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />

            <input
              type="number"
              min={5}
              max={50}
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
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Layers2 size={15} />}
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
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_12px_28px_rgba(20,38,52,0.08)]">
          {currentCard ? (
            <>
              <div className="mb-3 flex items-center justify-between text-xs text-[var(--ink-soft)]">
                <span>
                  Card {index + 1} / {cards.length}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#edf2f5]">
                <div className="h-full bg-[var(--primary)]" style={{ width: `${progress}%` }} />
              </div>

              <button
                type="button"
                onClick={() => setFlipped((value) => !value)}
                className="mt-5 block h-[320px] w-full rounded-3xl [perspective:1200px]"
              >
                <div
                  className="relative h-full w-full rounded-3xl transition-transform duration-500 [transform-style:preserve-3d]"
                  style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
                >
                  <div className="absolute inset-0 grid place-items-center rounded-3xl border border-[var(--line)] bg-[#f9fbff] p-6 text-center [backface-visibility:hidden]">
                    <p className="text-xs uppercase tracking-[0.15em] text-[var(--ink-soft)]">Front</p>
                    <p className="mt-3 text-xl font-semibold text-[var(--ink)]">{currentCard.front}</p>
                    <p className="mt-3 text-xs text-[var(--ink-soft)]">Click to flip</p>
                  </div>
                  <div className="absolute inset-0 grid place-items-center rounded-3xl bg-[var(--primary)] p-6 text-center text-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    <p className="text-xs uppercase tracking-[0.15em] text-white/70">Back</p>
                    <p className="mt-3 text-base leading-relaxed">{currentCard.back}</p>
                    <p className="mt-4 text-xs text-white/75">
                      Page {currentCard.sourcePage || "-"} · {currentCard.category || "concept"}
                    </p>
                  </div>
                </div>
              </button>

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIndex((value) => Math.max(0, value - 1));
                    setFlipped(false);
                  }}
                  disabled={index === 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-[var(--ink-soft)] disabled:opacity-50"
                >
                  <ArrowLeft size={14} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIndex((value) => Math.min(cards.length - 1, value + 1));
                    setFlipped(false);
                  }}
                  disabled={index === cards.length - 1}
                  className="inline-flex items-center gap-1 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Next
                  <ArrowRight size={14} />
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-white p-10 text-center text-sm text-[var(--ink-soft)]">
              Generate flashcards from a source to begin.
            </div>
          )}
        </section>
      </div>
      <BottomToast toast={toast} />
    </AppShell>
  );
}
