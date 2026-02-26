"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Atom, CalendarClock, CircleCheck, MessageSquareText } from "lucide-react";

const streams = [
  {
    id: "SEE",
    title: "SEE Student",
    subtitle: "Class 10 preparation flow",
  },
  {
    id: "PLUS2_SCIENCE",
    title: "+2 Science",
    subtitle: "Physics, Chemistry, Math, Biology",
  },
  {
    id: "PLUS2_MANAGEMENT",
    title: "+2 Management",
    subtitle: "Business, Account, Economics focus",
  },
] as const;

const features = [
  {
    icon: MessageSquareText,
    title: "Source-backed answers",
    text: "Chat answers stay tied to your uploaded textbooks with citations.",
  },
  {
    icon: CalendarClock,
    title: "Smart planner",
    text: "Build daily study plans and track what is done or pending.",
  },
  {
    icon: Atom,
    title: "Practice mode",
    text: "Generate MCQs and flashcards from your own source material.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [selectedStream, setSelectedStream] = useState<(typeof streams)[number]["id"]>("SEE");

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      router.replace("/chat");
    }
  }, [router]);

  const selectedLabel = useMemo(() => {
    return streams.find((stream) => stream.id === selectedStream)?.title || "Student";
  }, [selectedStream]);

  return (
    <div className="app-grid-bg min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1380px] grid-cols-1 overflow-hidden rounded-none border-[var(--line)] bg-[var(--panel)] shadow-[0_30px_80px_rgba(16,35,49,0.14)] lg:my-3 lg:grid-cols-[1.1fr_1fr] lg:rounded-[30px] lg:border">
        <section className="relative flex flex-col justify-between overflow-hidden border-b border-[var(--line)] bg-gradient-to-br from-[#dbe6eb] to-[#bfd0d8] p-8 sm:p-12 lg:border-b-0 lg:border-r">
          <div className="pointer-events-none absolute -left-24 top-20 h-60 w-60 rounded-full bg-white/40 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-12 h-56 w-56 rounded-full bg-[#6789af]/30 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
              <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
              StudyFlow Nepal
            </div>

            <h1 className="mt-6 max-w-lg text-4xl font-bold leading-tight text-[var(--ink)] sm:text-5xl">
              Elevate Your Learning with a Smarter Study System.
            </h1>
            <p className="mt-4 max-w-xl text-base text-[#2e4757] sm:text-lg">
              The all-in-one study companion designed for SEE and +2 students in Nepal.
              Organize, study, and review faster.
            </p>
          </div>

          <div className="relative space-y-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="glass fade-in-up flex items-start gap-3 rounded-2xl px-4 py-3"
                >
                  <div className="rounded-xl bg-white p-2 text-[var(--primary)]">
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{feature.title}</p>
                    <p className="text-xs text-[#3f5b6d]">{feature.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-xl rounded-3xl border border-[var(--line)] bg-white px-5 py-6 shadow-[0_16px_35px_rgba(37,56,74,0.08)] sm:px-7 sm:py-8">
            <div className="mb-6">
              <p className="text-sm font-semibold text-[var(--ink)]">Personalize Your Study Experience</p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                Choose your stream and continue to auth.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {streams.map((stream) => {
                const active = stream.id === selectedStream;
                return (
                  <button
                    key={stream.id}
                    type="button"
                    onClick={() => setSelectedStream(stream.id)}
                    className={`rounded-2xl border px-3 py-4 text-left transition ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[0_8px_16px_rgba(45,67,204,0.18)]"
                        : "border-[var(--line)] bg-[#f9fbfc] hover:border-[var(--line-strong)]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">{stream.title}</p>
                    <p className="mt-1 text-xs text-[var(--ink-soft)]">{stream.subtitle}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl bg-[var(--panel)] px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-[var(--ink)]">
                <CircleCheck size={14} className="text-[var(--success)]" />
                Active profile: <span className="font-semibold">{selectedLabel}</span>
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("preferredStream", selectedStream);
                  router.push("/signup");
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
              >
                Start Signup
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("preferredStream", selectedStream);
                  router.push("/login");
                }}
                className="flex-1 rounded-xl border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink-soft)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                I already have account
              </button>
            </div>

            <p className="mt-6 text-center text-xs text-[var(--ink-soft)]">
              Need backend health check?{" "}
              <Link className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline" href="/test-integration">
                Open integration test
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
