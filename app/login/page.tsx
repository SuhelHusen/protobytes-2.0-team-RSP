"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login } from "@/lib/api";

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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const preferredStream = useSyncExternalStore(
    subscribePreferredStream,
    getPreferredStreamSnapshot,
    () => ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const response = await login({ email, password });
    setSubmitting(false);

    if (response.error) {
      setError(response.error);
      return;
    }

    router.push("/chat");
  }

  return (
    <div className="app-grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-[1100px] grid-cols-1 overflow-hidden rounded-3xl border border-[var(--line)] bg-white shadow-[0_24px_70px_rgba(15,33,47,0.12)] lg:grid-cols-[1fr_1.1fr]">
        <section className="hidden border-r border-[var(--line)] bg-gradient-to-br from-[#d8e4e8] via-[#dbe6eb] to-[#c8d7df] p-8 lg:block">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-soft)]">Welcome back</p>
          <h1 className="mt-3 text-4xl font-bold text-[var(--ink)]">Continue where you left off.</h1>
          <p className="mt-4 max-w-md text-sm text-[var(--ink-soft)]">
            Access your uploaded sources, planner progress, and chat workspace from one place.
          </p>

          <div className="mt-8 space-y-2 text-sm text-[var(--ink-soft)]">
            <p>1. Upload or manage your textbook PDFs.</p>
            <p>2. Ask topic-focused questions and review citations.</p>
            <p>3. Run MCQ and flashcard revision cycles.</p>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mx-auto max-w-md">
            <h2 className="text-2xl font-bold text-[var(--ink)]">Welcome Back</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Sign in to access your study hub.</p>

            {preferredStream ? (
              <p className="mt-3 inline-flex rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                Preferred stream: {preferredStream}
              </p>
            ) : null}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-[var(--ink)]">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--primary)]"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-[var(--ink)]">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-[var(--primary)]"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-soft)]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              {error ? (
                <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-[var(--ink-soft)]">
              No account yet?{" "}
              <Link className="font-semibold text-[var(--primary)] hover:underline" href="/signup">
                Create one
              </Link>
            </p>

            <p className="mt-3 text-center text-xs text-[var(--ink-soft)]">
              <Link href="/" className="hover:underline">
                Back to landing
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
