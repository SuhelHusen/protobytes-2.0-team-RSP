"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { signup } from "@/lib/api";

const streamOptions = [
  { id: "SEE", title: "SEE Student", details: "Secondary Education Examination" },
  { id: "PLUS2_SCIENCE", title: "+2 Science", details: "Physics, Chemistry, Mathematics, Biology" },
  { id: "PLUS2_MANAGEMENT", title: "+2 Management", details: "Account, Economics, Business Studies" },
] as const;

type StreamId = (typeof streamOptions)[number]["id"];

function isStreamId(value: string): value is StreamId {
  return streamOptions.some((option) => option.id === value);
}

function subscribePreferredStream(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.key === "preferredStream") onStoreChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getPreferredStreamSnapshot() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("preferredStream") || "";
}

function resolveStream(preferredStream: string, manualStream: StreamId | null): StreamId {
  if (manualStream) return manualStream;
  if (isStreamId(preferredStream)) {
    return preferredStream;
  }
  return "SEE";
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const preferredStream = useSyncExternalStore(
    subscribePreferredStream,
    getPreferredStreamSnapshot,
    () => ""
  );
  const [manualStream, setManualStream] = useState<StreamId | null>(null);
  const stream = resolveStream(preferredStream, manualStream);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const response = await signup({ name, email, password, stream });
    setSubmitting(false);

    if (response.error) {
      setError(response.error);
      return;
    }

    localStorage.setItem("preferredStream", stream);
    router.push("/chat");
  }

  return (
    <div className="app-grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-[var(--line)] bg-white p-6 shadow-[0_22px_65px_rgba(16,32,46,0.12)] sm:p-8">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">Create account</p>
          <h1 className="mt-2 text-3xl font-bold text-[var(--ink)]">Personalize Your Study Experience</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Pick your stream and create your student workspace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {streamOptions.map((option) => {
              const selected = option.id === stream;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setManualStream(option.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--line)] bg-[#fafcfd] hover:border-[var(--line-strong)]"
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--ink)]">{option.title}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">{option.details}</p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[var(--ink)]">Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Your name"
                className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2.5 outline-none transition focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[var(--ink)]">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2.5 outline-none transition focus:border-[var(--primary)]"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-[var(--ink)]">Password</span>
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 6 characters"
              className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2.5 outline-none transition focus:border-[var(--primary)]"
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-[var(--danger)]/35 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--ink-soft)]">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
