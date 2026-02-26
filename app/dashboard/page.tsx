"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  BarChart3,
  BookCheck,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Flame,
  RefreshCw,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { TaskStats, getTaskStats, updateTaskStatus } from "@/lib/api";

const mockStats: TaskStats = {
  total: 42,
  todo: 19,
  doing: 8,
  procrastinated: 2,
  done: 15,
  completedToday: 4,
  overdue: 2,
  todayTasks: [
    {
      id: "m1",
      title: "Revise Trigonometry identities",
      subject: "Mathematics",
      deadline: new Date().toISOString(),
      status: "DOING",
      priority: "HIGH",
    },
    {
      id: "m2",
      title: "Chemistry chapter summary notes",
      subject: "Chemistry",
      deadline: new Date().toISOString(),
      status: "TODO",
      priority: "MEDIUM",
    },
    {
      id: "m3",
      title: "Practice SEE model set - English",
      subject: "English",
      deadline: new Date().toISOString(),
      status: "DONE",
      priority: "LOW",
    },
  ],
  subjectBreakdown: [
    { subject: "Math", status: "DONE", count: 7 },
    { subject: "Physics", status: "DOING", count: 5 },
    { subject: "Chemistry", status: "TODO", count: 6 },
    { subject: "English", status: "DONE", count: 3 },
  ],
};

const weeklyFocus = [45, 32, 58, 28, 52, 64, 41];
const DASHBOARD_REFRESH_MS = 30000;

type Metric = {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
};

type SubjectSlice = {
  subject: string;
  count: number;
  percent: number;
  color: string;
};

const subjectPalette = [
  "#2d43cc",
  "#d38f2c",
  "#1f8f5f",
  "#cf425b",
  "#7d4ede",
  "#2c8ec9",
  "#db6a34",
];

export default function DashboardPage() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [apiNote, setApiNote] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [markingTaskId, setMarkingTaskId] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const [username] = useState(() => {
    if (typeof window === "undefined") return "Student";
    try {
      const raw = localStorage.getItem("authUser");
      if (!raw) return "Student";
      const parsed = JSON.parse(raw) as { name?: string };
      return parsed.name?.trim() || "Student";
    } catch {
      return "Student";
    }
  });

  const loadStats = useCallback(async (background = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (background && mountedRef.current) setRefreshing(true);

    try {
      const response = await getTaskStats();
      if (!mountedRef.current) return;

      if (response.data) {
        setStats(response.data);
        setApiNote("");
        setLastSyncedAt(new Date().toISOString());
        return;
      }

      setStats((current) => current ?? mockStats);
      if (response.status === 501) {
        setApiNote("Planner stats are unavailable right now.");
      } else if (response.error) {
        setApiNote(`Could not load live stats: ${response.error}`);
      } else {
        setApiNote("Could not load live stats right now.");
      }
    } finally {
      inFlightRef.current = false;
      if (background && mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadStats();

    const onFocus = () => {
      void loadStats(true);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadStats(true);
      }
    };

    const intervalId = window.setInterval(() => {
      void loadStats(true);
    }, DASHBOARD_REFRESH_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadStats]);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) return "Syncing dashboard data...";
    const time = new Date(lastSyncedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return `Last synced ${time}`;
  }, [lastSyncedAt]);

  const handleMarkDone = useCallback(
    async (taskId: string) => {
      if (!taskId || markingTaskId) return;
      setMarkingTaskId(taskId);

      const response = await updateTaskStatus(taskId, "DONE");
      if (!mountedRef.current) return;

      if (response.error) {
        setApiNote(`Could not mark task as done: ${response.error}`);
        setMarkingTaskId(null);
        return;
      }

      setApiNote("");
      await loadStats(true);
      if (!mountedRef.current) return;
      setMarkingTaskId(null);
    },
    [loadStats, markingTaskId]
  );

  const completionRate = useMemo(() => {
    if (!stats || stats.total === 0) return 0;
    return Math.round((stats.done / stats.total) * 100);
  }, [stats]);

  const metrics: Metric[] = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Total Tasks",
        value: stats.total,
        icon: BookCheck,
        color: "text-[#2d43cc] bg-[#e8ecff]",
      },
      {
        label: "Completed",
        value: stats.done,
        icon: CircleCheck,
        color: "text-[#1f8f5f] bg-[#e8f7f0]",
      },
      {
        label: "In Progress",
        value: stats.doing,
        icon: Clock3,
        color: "text-[#d38f2c] bg-[#fff4e1]",
      },
      {
        label: "Procrastinated",
        value: stats.procrastinated ?? stats.overdue,
        icon: AlertTriangle,
        color: "text-[#cf425b] bg-[#ffe9ed]",
      },
    ];
  }, [stats]);

  const subjectSlices = useMemo<SubjectSlice[]>(() => {
    if (!stats?.subjectBreakdown?.length) return [];

    const subjectTotals = stats.subjectBreakdown.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.subject] = (acc[entry.subject] || 0) + entry.count;
      return acc;
    }, {});

    const rows = Object.entries(subjectTotals)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;

    return rows.map((row, index) => ({
      subject: row.subject,
      count: row.count,
      percent: (row.count / total) * 100,
      color: subjectPalette[index % subjectPalette.length],
    }));
  }, [stats]);

  const subjectRingStyle = useMemo(() => {
    if (subjectSlices.length === 0) {
      return { background: "conic-gradient(#cbd8e0 0deg 360deg)" };
    }

    let running = 0;
    const stops = subjectSlices.map((slice) => {
      const start = running;
      const sweep = (slice.percent / 100) * 360;
      running += sweep;
      const end = Math.min(running, 360);
      return `${slice.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
    });
    return { background: `conic-gradient(${stops.join(", ")})` };
  }, [subjectSlices]);

  return (
    <AppShell
      title={`Welcome back, ${username}!`}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2">
          <p className="text-xs text-[var(--ink-soft)]">{lastSyncedLabel}</p>
          <button
            type="button"
            onClick={() => {
              void loadStats(true);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {apiNote ? (
          <div className="rounded-2xl border border-[#f0b24c]/40 bg-[#fff4dd] px-4 py-2.5 text-sm text-[#845710]">
            {apiNote}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.label}
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(27,44,58,0.07)]"
              >
                <span className={`inline-flex rounded-xl p-2 ${item.color}`}>
                  <Icon size={16} />
                </span>
                <p className="mt-3 text-2xl font-bold text-[var(--ink)]">{item.value}</p>
                <p className="text-sm text-[var(--ink-soft)]">{item.label}</p>
              </article>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(27,44,58,0.07)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--ink)]">Weekly Study Activity</h3>
                <p className="text-xs text-[var(--ink-soft)]">Hours-focused intensity trend</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#edf2ff] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
                <Activity size={14} />
                {completionRate}% complete
              </span>
            </div>

            <div className="grid h-52 grid-cols-7 items-end gap-2">
              {weeklyFocus.map((value, index) => (
                <div key={index} className="grid h-full grid-rows-[1fr_auto] items-end gap-1">
                  <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#edf2f5]">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-xl bg-gradient-to-b from-[#4264f1] to-[#2d43cc]"
                      style={{ height: `${Math.max(4, value)}%` }}
                    />
                  </div>
                  <span className="text-center text-[10px] text-[var(--ink-soft)]">
                    {["S", "M", "T", "W", "T", "F", "S"][index]}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(27,44,58,0.07)]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--ink)]">Subject Progress Ring</h3>
              <BarChart3 size={16} className="text-[var(--ink-soft)]" />
            </div>
            <div className="mx-auto grid h-44 w-44 place-items-center rounded-full border border-[var(--line)] p-2">
              <div className="grid h-full w-full place-items-center rounded-full p-5" style={subjectRingStyle}>
                <div className="grid h-full w-full place-items-center rounded-full bg-[var(--card)]">
                  <span className="text-2xl font-bold text-[var(--ink)]">{completionRate}%</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-1.5">
              {subjectSlices.length > 0 ? (
                subjectSlices.map((slice) => (
                  <div key={slice.subject} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 text-[var(--ink-soft)]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                      {slice.subject}
                    </span>
                    <span className="font-semibold text-[var(--ink)]">
                      {Math.round(slice.percent)}% ({slice.count})
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-xs text-[var(--ink-soft)]">
                  Add more tasks to see subject distribution.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(27,44,58,0.07)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--ink)]">Today Focus List</h3>
              <span className="text-xs text-[var(--ink-soft)]">
                {stats?.todayTasks.length || 0} items
              </span>
            </div>
            <div className="space-y-2">
              {(stats?.todayTasks || []).length > 0 ? (
                (stats?.todayTasks || []).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[#fbfcfd] px-3 py-2.5"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        task.priority === "HIGH"
                          ? "bg-[#cf425b]"
                          : task.priority === "MEDIUM"
                            ? "bg-[#d38f2c]"
                            : "bg-[#1f8f5f]"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{task.title}</p>
                      <p className="text-xs text-[var(--ink-soft)]">{task.subject}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-[#eef3f6] px-2 py-0.5 text-[11px] text-[var(--ink-soft)]">
                        {task.status}
                      </span>
                      {task.status !== "DONE" ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleMarkDone(task.id);
                          }}
                          disabled={markingTaskId !== null}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-soft)] transition hover:border-[var(--success)] hover:text-[var(--success)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Check size={11} />
                          {markingTaskId === task.id ? "Saving..." : "Mark done"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[#fbfcfd] px-3 py-6 text-center text-sm text-[var(--ink-soft)]">
                  No tasks are due today. Add or reschedule tasks in Planner to see them here.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(27,44,58,0.07)]">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Quick Actions</h3>
            <div className="mt-4 space-y-2">
              <Link
                href="/chat"
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fafcfd] px-3 py-2.5 text-sm text-[var(--ink)] hover:border-[var(--primary)]"
              >
                Continue Study Chat
                <Flame size={15} className="text-[var(--danger)]" />
              </Link>
              <Link
                href="/planner"
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fafcfd] px-3 py-2.5 text-sm text-[var(--ink)] hover:border-[var(--primary)]"
              >
                Open Planner
                <CalendarDays size={15} className="text-[var(--primary)]" />
              </Link>
              <Link
                href="/mcq"
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fafcfd] px-3 py-2.5 text-sm text-[var(--ink)] hover:border-[var(--primary)]"
              >
                Practice MCQ
                <BookCheck size={15} className="text-[var(--success)]" />
              </Link>
              <Link
                href="/mindmap"
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fafcfd] px-3 py-2.5 text-sm text-[var(--ink)] hover:border-[var(--primary)]"
              >
                Build Mind Map
                <Brain size={15} className="text-[var(--primary)]" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

