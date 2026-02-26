"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  BookOpen,
  CalendarDays,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";
import { logout } from "@/lib/api";

type ShellProps = {
  title: string;
  subtitle?: string;
  showPracticeTools?: boolean;
  sidebarContent?: React.ReactNode;
  children: React.ReactNode;
};

type AuthUser = {
  name?: string;
  email?: string;
  stream?: string;
};

const topNavItems = [
  { href: "/chat", label: "Study Chat", icon: MessageSquare },
  { href: "/planner", label: "Planner", icon: CalendarDays },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const practiceItems = [
  { href: "/mcq", label: "MCQ Practice", icon: BookOpen },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/mindmap", label: "Mind Map", icon: Brain },
];

type ThemeMode = "light" | "dark";

export default function AppShell({
  title,
  subtitle,
  showPracticeTools = false,
  sidebarContent,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser>({});
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("authUser");
    const storedTheme = localStorage.getItem("themeMode");

    if (!token) {
      router.replace("/login");
      return;
    }

    if (storedUser) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        setUser({});
      }
    }

    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }

    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("themeMode", theme);
  }, [theme, ready]);

  const streamLabel = useMemo(() => {
    switch (user.stream) {
      case "PLUS2_SCIENCE":
        return "+2 Science";
      case "PLUS2_MANAGEMENT":
        return "+2 Management";
      case "SEE":
        return "SEE";
      default:
        return "Student";
    }
  }, [user.stream]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem("authUser");
    router.replace("/login");
  };

  const hasRightRail = Boolean(sidebarContent) || showPracticeTools;

  if (!ready) {
    return (
      <div className="app-grid-bg flex min-h-screen items-center justify-center">
        <div className="glass rounded-2xl px-6 py-4 text-sm text-[var(--ink-soft)]">
          Loading workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="app-grid-bg min-h-screen">
      <div className="mx-auto max-w-[1450px] px-3 py-3 sm:px-5">
        <div className="min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_12px_30px_rgba(40,58,77,0.08)]">
          <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--panel)]/85">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--ink-soft)]">
                  StudyFlow Nepal
                </p>
                <h2 className="text-xl font-semibold text-[var(--ink)]">{title}</h2>
                {subtitle ? (
                  <p className="text-sm text-[var(--ink-soft)]">{subtitle}</p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTheme((mode) => (mode === "light" ? "dark" : "light"))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--card)] text-[var(--ink-soft)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                  aria-label={theme === "light" ? "Enable dark mode" : "Enable light mode"}
                >
                  {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
                </button>

                <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-2 py-1.5 sm:flex">
                  <Image
                    src="/profile-placeholder.svg"
                    alt="Profile picture"
                    width={28}
                    height={28}
                    className="rounded-full border border-[var(--line)] bg-[#f4f8ff]"
                  />
                  <div className="pr-1 text-right">
                    <p className="text-xs font-semibold text-[var(--ink)]">{user.name || "Student"}</p>
                    <p className="text-[11px] text-[var(--ink-soft)]">{streamLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-white px-3 py-1.5 text-xs text-[var(--ink-soft)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            </div>

            <div className="px-4 pb-3 sm:px-6">
              <nav className="flex flex-wrap items-center gap-1.5">
                {topNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-[var(--primary)] text-white shadow-[0_8px_20px_rgba(45,67,204,0.22)]"
                          : "border border-[var(--line)] bg-[var(--card)] text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                      }`}
                    >
                      <Icon size={14} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </header>

          <div className={`gap-4 p-3 sm:p-5 ${hasRightRail ? "grid xl:grid-cols-[minmax(0,1fr)_240px]" : ""}`}>
            <main className="min-w-0">{children}</main>

            {hasRightRail ? (
              <aside className="space-y-4">
                {showPracticeTools ? (
                  <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_24px_rgba(22,38,52,0.08)]">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
                      <Sparkles size={13} className="text-[var(--primary)]" />
                      Practice Tools
                    </p>
                    <div className="mt-3 space-y-2">
                      {practiceItems.map((item) => {
                        const Icon = item.icon;
                        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                              active
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                                : "border-[var(--line)] bg-[#fbfdfe] text-[var(--ink)] hover:border-[var(--primary)]"
                            }`}
                          >
                            <span>{item.label}</span>
                            <Icon size={15} />
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
                {sidebarContent}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
