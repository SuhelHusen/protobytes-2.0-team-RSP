
"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImagePlus,
  Pause,
  Pin,
  Play,
  Plus,
  Sparkles,
  TimerReset,
  Wand2,
  X,
} from "lucide-react";
import Image from "next/image";
import AppShell from "@/components/layout/AppShell";
import {
  StudyTask,
  TaskPriority,
  TaskStatus,
  createTask,
  generateSchedule,
  getTasks,
  updateTaskStatus,
} from "@/lib/api";

type PlannerTab = "calendar" | "board" | "focus";
type TaskState = StudyTask & { local?: boolean };
type FocusPhase = "focus" | "break";

interface ScheduledBlock {
  id: string;
  taskId: string;
  date: string;
  startHour: number;
  durationHours: number;
}

interface BoardItem {
  id: string;
  type: "task" | "image";
  title: string;
  taskId?: string;
  imageDataUrl?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragPayload = { type: "task"; taskId: string } | { type: "event"; eventId: string };

interface BoardDragMeta {
  itemId: string;
  offsetX: number;
  offsetY: number;
}

const STORAGE_KEYS = {
  taskHours: "planner.taskHours.v3",
  scheduledBlocks: "planner.scheduledBlocks.v3",
  boardItems: "planner.boardItems.v3",
  focusMinutes: "planner.focusMinutes.v3",
  breakMinutes: "planner.breakMinutes.v3",
  completedPomodoros: "planner.completedPomodoros.v3",
  focusLog: "planner.focusLog.v3",
} as const;

const HOURS = Array.from({ length: 18 }, (_, index) => index + 6); // 6 AM to 11 PM
const HOUR_CELL_HEIGHT = 54;
const HEATMAP_WEEKS = 104;
const DAY_ROW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const mockTasks: TaskState[] = [
  {
    id: "local-1",
    title: "Physics numericals: force and motion",
    description: "Solve at least 15 mixed questions.",
    subject: "Physics",
    deadline: new Date().toISOString(),
    status: "TODO",
    priority: "HIGH",
    ai_generated: true,
    local: true,
  },
  {
    id: "local-2",
    title: "English writing practice",
    subject: "English",
    deadline: new Date(Date.now() + 86400000).toISOString(),
    status: "DOING",
    priority: "MEDIUM",
    ai_generated: false,
    local: true,
  },
  {
    id: "local-3",
    title: "Chemistry formula revision",
    subject: "Chemistry",
    deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
    status: "DONE",
    priority: "LOW",
    ai_generated: false,
    local: true,
  },
];

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function priorityBadge(priority: TaskPriority) {
  if (priority === "HIGH") return "bg-[#ffe8ed] text-[#b6344c]";
  if (priority === "MEDIUM") return "bg-[#fff4dd] text-[#89550e]";
  return "bg-[#e8f7f0] text-[#1f8f5f]";
}

function taskStatusBadge(status: TaskStatus) {
  if (status === "PROCRASTINATED") return "bg-[#ffe8ed] text-[#b6344c]";
  if (status === "DOING") return "bg-[#fff4dd] text-[#89550e]";
  if (status === "DONE") return "bg-[#e8f7f0] text-[#1f8f5f]";
  return "bg-[#edf2f5] text-[var(--ink-soft)]";
}

function taskStatusLabel(status: TaskStatus) {
  if (status === "PROCRASTINATED") return "PROCRASTINATED";
  return status;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const diff = copy.getDay(); // sunday=0
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isPastDate(deadline: string | null): boolean {
  if (!deadline) return false;
  const normalized = deadline.slice(0, 10);
  return normalized < toIsoDate(new Date());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatHour(hour: number): string {
  const normalized = hour % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 || 12;
  return `${display} ${suffix}`;
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(seconds, 0);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${secs}`;
}

function formatFocusHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toFixed(1)}h`;
}

function priorityRank(priority: TaskPriority): number {
  if (priority === "HIGH") return 0;
  if (priority === "MEDIUM") return 1;
  return 2;
}

function heatColor(seconds: number, isSunday = false): string {
  if (isSunday) {
    if (seconds <= 0) return "bg-[#fdecef]";
    if (seconds < 15 * 60) return "bg-[#f8c9d7]";
    if (seconds < 30 * 60) return "bg-[#f3a5bf]";
    if (seconds < 60 * 60) return "bg-[#ea7ea3]";
    return "bg-[#d45482]";
  }

  if (seconds <= 0) return "bg-[#ebedf0]";
  if (seconds < 15 * 60) return "bg-[#d2ebff]";
  if (seconds < 30 * 60) return "bg-[#8bc8ff]";
  if (seconds < 60 * 60) return "bg-[#4f9df6]";
  return "bg-[#1f67cc]";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function PlannerPage() {
  const [activeTab, setActiveTab] = useState<PlannerTab>("calendar");
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [apiNote, setApiNote] = useState("");
  const [markingDoneTaskId, setMarkingDoneTaskId] = useState<string | null>(null);
  const [calendarDragTask, setCalendarDragTask] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("General");
  const [newPriority, setNewPriority] = useState<TaskPriority>("MEDIUM");
  const [newDeadline, setNewDeadline] = useState("");
  const [newHours, setNewHours] = useState(2);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [taskHours, setTaskHours] = useState<Record<string, number>>(() =>
    readStorage<Record<string, number>>(STORAGE_KEYS.taskHours, {})
  );
  const [scheduledBlocks, setScheduledBlocks] = useState<ScheduledBlock[]>(() =>
    readStorage<ScheduledBlock[]>(STORAGE_KEYS.scheduledBlocks, [])
  );
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => startOfDay(new Date()));
  const dragPayloadRef = useRef<DragPayload | null>(null);

  const [boardItems, setBoardItems] = useState<BoardItem[]>(() =>
    readStorage<BoardItem[]>(STORAGE_KEYS.boardItems, [])
  );
  const [selectedTaskToPin, setSelectedTaskToPin] = useState("");
  const [draggingBoardItemId, setDraggingBoardItemId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardDragRef = useRef<BoardDragMeta | null>(null);

  const [focusMinutes, setFocusMinutes] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.focusMinutes, 25)
  );
  const [breakMinutes, setBreakMinutes] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.breakMinutes, 5)
  );
  const [focusPhase, setFocusPhase] = useState<FocusPhase>("focus");
  const [pomodoroSecondsLeft, setPomodoroSecondsLeft] = useState<number>(
    readStorage<number>(STORAGE_KEYS.focusMinutes, 25) * 60
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [focusOverlay, setFocusOverlay] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.completedPomodoros, 0)
  );
  const [focusLogSeconds, setFocusLogSeconds] = useState<Record<string, number>>(() =>
    readStorage<Record<string, number>>(STORAGE_KEYS.focusLog, {})
  );

  useEffect(() => {
    let active = true;

    (async () => {
      const response = await getTasks();
      if (!active) return;

      if (response.data?.tasks) {
        const nextTasks = response.data.tasks as TaskState[];
        setTasks(nextTasks);
        setSelectedTaskToPin((current) =>
          current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id || ""
        );
        setApiNote("");
        setTasksLoaded(true);
      } else {
        setTasks(mockTasks);
        setSelectedTaskToPin((current) =>
          current && mockTasks.some((task) => task.id === current) ? current : mockTasks[0]?.id || ""
        );
        if (response.status === 501) {
          setApiNote("Planner sync is unavailable right now.");
        } else if (response.error) {
          setApiNote(`Could not load live planner data: ${response.error}`);
        }
        setTasksLoaded(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.taskHours, taskHours);
  }, [taskHours]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.scheduledBlocks, scheduledBlocks);
  }, [scheduledBlocks]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.boardItems, boardItems);
  }, [boardItems]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.focusMinutes, focusMinutes);
  }, [focusMinutes]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.breakMinutes, breakMinutes);
  }, [breakMinutes]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.completedPomodoros, completedPomodoros);
  }, [completedPomodoros]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.focusLog, focusLogSeconds);
  }, [focusLogSeconds]);

  useEffect(() => {
    if (!timerRunning) return;

    const interval = window.setInterval(() => {
      setPomodoroSecondsLeft((current) => {
        if (focusPhase === "focus") {
          const dateKey = toIsoDate(new Date());
          setFocusLogSeconds((history) => ({
            ...history,
            [dateKey]: (history[dateKey] || 0) + 1,
          }));
        }

        if (current <= 1) {
          if (focusPhase === "focus") {
            setCompletedPomodoros((value) => value + 1);
            setFocusPhase("break");
            setFocusOverlay(false);
            return breakMinutes * 60;
          }
          setFocusPhase("focus");
          return focusMinutes * 60;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [timerRunning, focusPhase, focusMinutes, breakMinutes]);

  useEffect(() => {
    if (!focusOverlay) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusOverlay(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [focusOverlay]);

  useEffect(() => {
    if (!draggingBoardItemId) return;

    const onPointerMove = (event: PointerEvent) => {
      const drag = boardDragRef.current;
      const boardElement = boardRef.current;
      if (!drag || !boardElement) return;

      const boardRect = boardElement.getBoundingClientRect();

      setBoardItems((current) =>
        current.map((item) => {
          if (item.id !== drag.itemId) return item;

          const maxX = Math.max(0, boardRect.width - item.width);
          const maxY = Math.max(0, boardRect.height - item.height);
          const nextX = clamp(event.clientX - boardRect.left - drag.offsetX, 0, maxX);
          const nextY = clamp(event.clientY - boardRect.top - drag.offsetY, 0, maxY);

          return { ...item, x: nextX, y: nextY };
        })
      );
    };

    const onPointerUp = () => {
      boardDragRef.current = null;
      setDraggingBoardItemId(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [draggingBoardItemId]);

  const taskMap = useMemo(() => {
    return new Map(tasks.map((task) => [task.id, task]));
  }, [tasks]);

  const todayIso = toIsoDate(new Date());

  const activePinnedTaskId = useMemo(() => {
    if (!tasks.length) return "";
    if (selectedTaskToPin && tasks.some((task) => task.id === selectedTaskToPin)) {
      return selectedTaskToPin;
    }
    return tasks[0].id;
  }, [tasks, selectedTaskToPin]);

  const syncTaskStatus = useCallback(async (taskId: string, nextStatus: TaskStatus) => {
    const response = await updateTaskStatus(taskId, nextStatus);
    if (response.error) {
      if (response.status === 404 || response.status === 501) {
        setApiNote("Task status endpoint is not fully integrated yet. Using local updates.");
      } else {
        setApiNote(`Could not persist task status: ${response.error}`);
      }
    }
  }, []);

  useEffect(() => {
    if (!tasksLoaded) return;
    if (!scheduledBlocks.length) return;

    const overdueIds: string[] = [];
    const normalizedTasks = tasks.map((task) => {
      if ((task.status === "TODO" || task.status === "DOING") && isPastDate(task.deadline)) {
        overdueIds.push(task.id);
        return { ...task, status: "PROCRASTINATED" as TaskStatus };
      }
      return task;
    });

    if (overdueIds.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasks(normalizedTasks);
      overdueIds.forEach((taskId) => {
        void syncTaskStatus(taskId, "PROCRASTINATED");
      });
    }

    const statusByTaskId = new Map((overdueIds.length > 0 ? normalizedTasks : tasks).map((task) => [task.id, task.status]));
    const cleanedBlocks = scheduledBlocks.filter((block) => {
      const status = statusByTaskId.get(block.taskId);
      if (!status) return false;
      if (status === "DONE" || status === "PROCRASTINATED") return false;
      return block.date >= todayIso;
    });

    if (cleanedBlocks.length !== scheduledBlocks.length) {
      setScheduledBlocks(cleanedBlocks);
    }
  }, [tasks, scheduledBlocks, syncTaskStatus, tasksLoaded, todayIso]);

  const activeScheduledBlocks = useMemo(() => {
    return scheduledBlocks.filter((block) => {
      const linkedTask = taskMap.get(block.taskId);
      if (!linkedTask) return false;
      if (linkedTask.status === "DONE" || linkedTask.status === "PROCRASTINATED") return false;
      return block.date >= todayIso;
    });
  }, [scheduledBlocks, taskMap, todayIso]);

  const unscheduledTasks = useMemo(() => {
    const scheduledTaskIds = new Set(activeScheduledBlocks.map((block) => block.taskId));
    return tasks.filter((task) => task.status !== "DONE" && !scheduledTaskIds.has(task.id));
  }, [tasks, activeScheduledBlocks]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index));
  }, [weekAnchor]);

  const weekDateSet = useMemo(() => {
    return new Set(weekDays.map((day) => toIsoDate(day)));
  }, [weekDays]);

  const weekLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    return `${shortDateFormatter.format(first)} - ${shortDateFormatter.format(last)}`;
  }, [weekDays]);

  const blocksByDate = useMemo(() => {
    return activeScheduledBlocks.reduce<Record<string, ScheduledBlock[]>>((acc, block) => {
      if (!acc[block.date]) acc[block.date] = [];
      acc[block.date].push(block);
      return acc;
    }, {});
  }, [activeScheduledBlocks]);

  const allocatedByDate = useMemo(() => {
    return activeScheduledBlocks.reduce<Record<string, number>>((acc, block) => {
      acc[block.date] = (acc[block.date] || 0) + block.durationHours;
      return acc;
    }, {});
  }, [activeScheduledBlocks]);

  const miniMonthGrid = useMemo(() => {
    const monthFirst = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), 1);
    const monthStartOffset = monthFirst.getDay();
    const monthDays = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth() + 1, 0).getDate();

    const cells: Array<{ day: number | null; iso?: string }> = [];
    for (let index = 0; index < monthStartOffset; index++) cells.push({ day: null });

    for (let day = 1; day <= monthDays; day++) {
      const date = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), day);
      cells.push({ day, iso: toIsoDate(date) });
    }

    while (cells.length % 7 !== 0) cells.push({ day: null });
    return cells;
  }, [weekAnchor]);

  const weekPlannedHours = useMemo(() => {
    return weekDays.reduce((sum, day) => sum + (allocatedByDate[toIsoDate(day)] || 0), 0);
  }, [weekDays, allocatedByDate]);

  const totalFocusSeconds = useMemo(() => {
    return Object.values(focusLogSeconds).reduce((sum, seconds) => sum + seconds, 0);
  }, [focusLogSeconds]);

  const heatmapWeeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStamp = today.getTime();
    const currentWeekStart = startOfWeek(today);
    const firstWeekStart = currentWeekStart;

    return Array.from({ length: HEATMAP_WEEKS }, (_, weekIndex) => {
      const weekStart = addDays(firstWeekStart, weekIndex * 7);
      const markerDate = addDays(weekStart, 3);
      const year = markerDate.getFullYear();
      const previousWeekYear =
        weekIndex > 0 ? addDays(addDays(firstWeekStart, (weekIndex - 1) * 7), 3).getFullYear() : null;
      const yearStart = previousWeekYear === null || year !== previousWeekYear;

      return {
        key: toIsoDate(weekStart),
        year,
        yearStart,
        days: Array.from({ length: 7 }, (_, dayIndex) => {
          const date = addDays(weekStart, dayIndex);
          const isPastDate = date.getTime() < todayStamp;
          const isPlaceholder = weekIndex === 0 && isPastDate;
          const iso = toIsoDate(date);

          return {
            iso: isPlaceholder ? `placeholder-${weekIndex}-${dayIndex}` : iso,
            label: isPlaceholder ? "" : shortDateFormatter.format(date),
            seconds: isPlaceholder ? 0 : focusLogSeconds[iso] || 0,
            isSunday: dayIndex === 0,
            isPlaceholder,
          };
        }),
      };
    });
  }, [focusLogSeconds]);

  async function markTaskDone(taskId: string) {
    if (!taskId || markingDoneTaskId) return;
    setMarkingDoneTaskId(taskId);

    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status: "DONE" } : task))
    );
    setScheduledBlocks((current) => current.filter((block) => block.taskId !== taskId));

    await syncTaskStatus(taskId, "DONE");
    setMarkingDoneTaskId(null);
  }

  function getTaskHours(taskId: string): number {
    return clamp(Math.round(taskHours[taskId] || 1), 1, 8);
  }

  function setHoursForTask(taskId: string, hours: number) {
    const next = clamp(Math.round(hours), 1, 8);

    setTaskHours((current) => ({ ...current, [taskId]: next }));
    setScheduledBlocks((current) =>
      current.map((block) => {
        if (block.taskId !== taskId) return block;
        const maxDuration = HOURS[HOURS.length - 1] + 1 - block.startHour;
        return { ...block, durationHours: clamp(next, 1, maxDuration) };
      })
    );
  }

  function handleDropOnSlot(dateIso: string, slotHour: number) {
    const payload = dragPayloadRef.current;
    dragPayloadRef.current = null;
    setCalendarDragTask(null);
    if (!payload) return;

    if (payload.type === "task") {
      const duration = getTaskHours(payload.taskId);
      const latestStart = HOURS[HOURS.length - 1] + 1 - duration;
      const safeStart = clamp(slotHour, HOURS[0], Math.max(HOURS[0], latestStart));

      setScheduledBlocks((current) => {
        const existingIndex = current.findIndex((block) => block.taskId === payload.taskId);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = {
            ...next[existingIndex],
            date: dateIso,
            startHour: safeStart,
            durationHours: duration,
          };
          return next;
        }

        return [
          ...current,
          {
            id: `block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            taskId: payload.taskId,
            date: dateIso,
            startHour: safeStart,
            durationHours: duration,
          },
        ];
      });

      const draggedTask = taskMap.get(payload.taskId);
      if (draggedTask && (draggedTask.status === "TODO" || draggedTask.status === "PROCRASTINATED")) {
        setTasks((current) =>
          current.map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: "DOING",
                }
              : task
          )
        );
        void syncTaskStatus(payload.taskId, "DOING");
      }

      return;
    }

    setScheduledBlocks((current) =>
      current.map((block) => {
        if (block.id !== payload.eventId) return block;
        const latestStart = HOURS[HOURS.length - 1] + 1 - block.durationHours;
        return {
          ...block,
          date: dateIso,
          startHour: clamp(slotHour, HOURS[0], Math.max(HOURS[0], latestStart)),
        };
      })
    );
  }

  function removeScheduledBlock(blockId: string) {
    const target = scheduledBlocks.find((block) => block.id === blockId);
    if (!target) return;

    setScheduledBlocks((current) => current.filter((block) => block.id !== blockId));

    const hasAnother = scheduledBlocks.some(
      (block) => block.taskId === target.taskId && block.id !== blockId
    );
    if (!hasAnother) {
      const linkedTask = taskMap.get(target.taskId);
      if (linkedTask && linkedTask.status === "DOING") {
        const nextStatus: TaskStatus = isPastDate(linkedTask.deadline)
          ? "PROCRASTINATED"
          : "TODO";
        setTasks((current) =>
          current.map((task) =>
            task.id === target.taskId
              ? {
                  ...task,
                  status: nextStatus,
                }
              : task
          )
        );
        void syncTaskStatus(target.taskId, nextStatus);
      }
    }
  }

  function updateBlockDuration(blockId: string, delta: number) {
    const target = scheduledBlocks.find((block) => block.id === blockId);
    if (!target) return;

    const maxDuration = HOURS[HOURS.length - 1] + 1 - target.startHour;
    const nextDuration = clamp(target.durationHours + delta, 1, maxDuration);

    setScheduledBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? {
              ...block,
              durationHours: nextDuration,
            }
          : block
      )
    );

    setTaskHours((current) => ({
      ...current,
      [target.taskId]: nextDuration,
    }));
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;

    const clampedHours = clamp(newHours, 1, 8);
    setCreating(true);

    const payload = {
      title: newTitle.trim(),
      subject: newSubject || "General",
      priority: newPriority,
      deadline: newDeadline || null,
      status: "TODO" as TaskStatus,
    };

    const response = await createTask(payload);
    setCreating(false);

    const createdTask = response.data?.task;
    if (createdTask) {
      setTasks((current) => [{ ...(createdTask as TaskState) }, ...current]);
      setTaskHours((current) => ({ ...current, [createdTask.id]: clampedHours }));
    } else {
      const fallbackTask: TaskState = {
        id: `local-${Date.now()}`,
        ...payload,
        ai_generated: false,
        local: true,
      };
      setTasks((current) => [fallbackTask, ...current]);
      setTaskHours((current) => ({ ...current, [fallbackTask.id]: clampedHours }));
      setApiNote("Task create endpoint unavailable. Added task locally.");
    }

    setNewTitle("");
    setNewSubject("General");
    setNewPriority("MEDIUM");
    setNewDeadline("");
    setNewHours(2);
  }

  async function handleGeneratePlan() {
    setGenerating(true);
    const examDate = toIsoDate(addDays(new Date(), 14));

    const response = await generateSchedule({
      examDate,
      hoursPerDay: 4,
      weakSubjects: ["Mathematics", "Physics"],
    });

    setGenerating(false);

    if (response.error || response.status === 501) {
      const generatedLocal: TaskState[] = [
        {
          id: `local-ai-${Date.now()}`,
          title: "Smart Plan: Physics past-question solve set",
          subject: "Physics",
          deadline: new Date(Date.now() + 86400000).toISOString(),
          status: "TODO",
          priority: "HIGH",
          ai_generated: true,
          local: true,
        },
        {
          id: `local-ai-${Date.now() + 1}`,
          title: "Smart Plan: Math theorem revision sprint",
          subject: "Mathematics",
          deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
          status: "TODO",
          priority: "MEDIUM",
          ai_generated: true,
          local: true,
        },
      ];
      setTasks((current) => [...generatedLocal, ...current]);
      setTaskHours((current) => {
        const next = { ...current };
        for (const task of generatedLocal) {
          next[task.id] = task.priority === "HIGH" ? 3 : 2;
        }
        return next;
      });
      setApiNote("Schedule service is unavailable. Added local tasks.");
      return;
    }

    const refreshed = await getTasks();
    if (refreshed.data?.tasks) {
      setTasks(refreshed.data.tasks as TaskState[]);
      setApiNote("");
    }
  }

  function autoAllocateWeek() {
    const weekDates = weekDays.map((day) => toIsoDate(day));
    const span = HOURS[HOURS.length - 1] + 1 - HOURS[0];

    const occupancy: Record<string, boolean[]> = {};
    for (const date of weekDates) {
      occupancy[date] = new Array(span).fill(false);
    }

    for (const block of scheduledBlocks) {
      if (!occupancy[block.date]) continue;
      for (let hour = block.startHour; hour < block.startHour + block.durationHours; hour++) {
        const idx = hour - HOURS[0];
        if (idx >= 0 && idx < span) occupancy[block.date][idx] = true;
      }
    }

    const candidates = unscheduledTasks
      .slice()
      .sort((a, b) => {
        const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return (a.deadline || "9999-12-31").localeCompare(b.deadline || "9999-12-31");
      });

    if (!candidates.length) {
      setApiNote("All current tasks are already placed on the calendar.");
      return;
    }

    const created: ScheduledBlock[] = [];
    const unplaced: string[] = [];

    for (const task of candidates) {
      const duration = getTaskHours(task.id);
      let placed = false;

      for (const date of weekDates) {
        const daySlots = occupancy[date];
        const maxStartIndex = daySlots.length - duration;
        for (let startIndex = 0; startIndex <= maxStartIndex; startIndex++) {
          const available = daySlots
            .slice(startIndex, startIndex + duration)
            .every((slotUsed) => !slotUsed);
          if (!available) continue;

          for (let offset = 0; offset < duration; offset++) {
            daySlots[startIndex + offset] = true;
          }

          created.push({
            id: `auto-${task.id}-${date}`,
            taskId: task.id,
            date,
            startHour: HOURS[0] + startIndex,
            durationHours: duration,
          });
          placed = true;
          break;
        }

        if (placed) break;
      }

      if (!placed) {
        unplaced.push(task.title);
      } else if (task.status === "TODO" || task.status === "PROCRASTINATED") {
        setTasks((current) =>
          current.map((item) => (item.id === task.id ? { ...item, status: "DOING" } : item))
        );
        void syncTaskStatus(task.id, "DOING");
      }
    }

    if (!created.length) {
      setApiNote("No open slots were available in this week view.");
      return;
    }

    setScheduledBlocks((current) => [...current, ...created]);
    if (unplaced.length) {
      setApiNote(`Allocated ${created.length} tasks. Could not fit: ${unplaced.join(", ")}`);
    } else {
      setApiNote(`Allocated ${created.length} tasks into this week.`);
    }
  }

  function pinTaskToBoard(taskId: string) {
    const task = taskMap.get(taskId);
    if (!task) return;

    setBoardItems((current) => [
      ...current,
      {
        id: `board-task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        type: "task",
        taskId: task.id,
        title: task.title,
        x: 40 + ((current.length * 47) % 420),
        y: 40 + ((current.length * 33) % 260),
        width: 230,
        height: 145,
      },
    ]);
  }

  async function handleBoardImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const loaded = await Promise.all(files.map((file) => fileToDataUrl(file)));

    setBoardItems((current) => {
      const next = [...current];
      loaded.forEach((imageDataUrl, index) => {
        next.push({
          id: `board-image-${Date.now()}-${index}`,
          type: "image",
          title: files[index].name,
          imageDataUrl,
          x: 60 + (((current.length + index) * 31) % 460),
          y: 80 + (((current.length + index) * 27) % 290),
          width: 230,
          height: 170,
        });
      });
      return next;
    });

    event.target.value = "";
  }

  function removeBoardItem(itemId: string) {
    setBoardItems((current) => current.filter((item) => item.id !== itemId));
  }

  function beginBoardDrag(event: React.PointerEvent<HTMLDivElement>, itemId: string) {
    if (event.button !== 0) return;
    const boardRect = boardRef.current?.getBoundingClientRect();
    const item = boardItems.find((entry) => entry.id === itemId);
    if (!boardRect || !item) return;

    event.preventDefault();
    boardDragRef.current = {
      itemId,
      offsetX: event.clientX - boardRect.left - item.x,
      offsetY: event.clientY - boardRect.top - item.y,
    };
    setDraggingBoardItemId(itemId);
  }

  function enterFocusMode() {
    setFocusPhase("focus");
    setPomodoroSecondsLeft(focusMinutes * 60);
    setTimerRunning(true);
    setFocusOverlay(true);
  }

  function resetPomodoro() {
    setTimerRunning(false);
    setFocusPhase("focus");
    setPomodoroSecondsLeft(focusMinutes * 60);
    setFocusOverlay(false);
  }

  return (
    <>
      <AppShell
        title="Study Planner"
      >
        <div className="space-y-4">
          {apiNote ? (
            <div className="rounded-2xl border border-[#f0b24c]/40 bg-[#fff4dd] px-4 py-2.5 text-sm text-[#845710]">
              {apiNote}
            </div>
          ) : null}

          <div className="inline-flex rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1">
            {[
              { key: "calendar", label: "Planner Calendar" },
              { key: "board", label: "Pin Board" },
              { key: "focus", label: "Focus Mode" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as PlannerTab)}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--ink-soft)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "calendar" ? (
            <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
              <section className="space-y-4">
                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_22px_rgba(22,38,52,0.08)]">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    Create Task
                  </h3>
                  <form onSubmit={handleCreateTask} className="space-y-2.5">
                    <input
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      placeholder="Task title"
                      className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newSubject}
                        onChange={(event) => setNewSubject(event.target.value)}
                        placeholder="Subject"
                        className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                      />
                      <select
                        value={newPriority}
                        onChange={(event) => setNewPriority(event.target.value as TaskPriority)}
                        className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={newDeadline}
                        onChange={(event) => setNewDeadline(event.target.value)}
                        className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                      />
                      <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm text-[var(--ink-soft)]">
                        Hours
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={newHours}
                          onChange={(event) => setNewHours(clamp(Number(event.target.value) || 1, 1, 8))}
                          className="w-14 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={creating}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {creating ? <Clock3 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Add task
                    </button>
                  </form>
                </article>

                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_22px_rgba(22,38,52,0.08)]">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                      Task Queue
                    </h3>
                    <button
                      type="button"
                      onClick={autoAllocateWeek}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      Auto Allocate
                    </button>
                  </div>

                  <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                    {unscheduledTasks.map((task) => (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={() => {
                          dragPayloadRef.current = { type: "task", taskId: task.id };
                          setCalendarDragTask(task.id);
                        }}
                        onDragEnd={() => {
                          dragPayloadRef.current = null;
                          setCalendarDragTask(null);
                        }}
                        className={`cursor-grab rounded-xl border px-3 py-2 shadow-[0_8px_15px_rgba(28,42,56,0.06)] active:cursor-grabbing ${
                          calendarDragTask === task.id
                            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                            : "border-[var(--line)] bg-white"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[var(--ink)]">{task.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full bg-[#edf2f5] px-2 py-0.5 text-[var(--ink-soft)]">
                            {task.subject}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 ${taskStatusBadge(task.status)}`}>
                            {taskStatusLabel(task.status)}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 ${priorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                          {task.ai_generated ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf1ff] px-2 py-0.5 text-[var(--primary)]">
                              <Wand2 size={10} />
                              Auto
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-[var(--ink-soft)]">
                          <span>Hours:</span>
                          <button
                            type="button"
                            onClick={() => setHoursForTask(task.id, getTaskHours(task.id) - 1)}
                            className="rounded-md border border-[var(--line)] px-2 py-0.5 hover:border-[var(--primary)]"
                          >
                            -
                          </button>
                          <span className="min-w-8 text-center font-semibold text-[var(--ink)]">
                            {getTaskHours(task.id)}h
                          </span>
                          <button
                            type="button"
                            onClick={() => setHoursForTask(task.id, getTaskHours(task.id) + 1)}
                            className="rounded-md border border-[var(--line)] px-2 py-0.5 hover:border-[var(--primary)]"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void markTaskDone(task.id)}
                          disabled={markingDoneTaskId !== null}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--card)] px-2 py-1 text-[11px] font-semibold text-[var(--ink-soft)] transition hover:border-[var(--success)] hover:text-[var(--success)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Check size={11} />
                          {markingDoneTaskId === task.id ? "Saving..." : "Mark done"}
                        </button>
                      </article>
                    ))}
                    {!unscheduledTasks.length ? (
                      <p className="rounded-xl border border-dashed border-[var(--line)] bg-[#f8fbfd] px-3 py-6 text-center text-xs text-[var(--ink-soft)]">
                        All tasks are already scheduled this week.
                      </p>
                    ) : null}
                  </div>
                </article>

                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_22px_rgba(22,38,52,0.08)]">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    Mini Month
                  </h3>
                  <p className="mb-2 text-xs font-semibold text-[var(--ink)]">
                    {monthFormatter.format(weekAnchor)}
                  </p>
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--ink-soft)]">
                    {DAY_ROW_LABELS.map((label, index) => (
                      <span key={`mini-${label}-${index}`} className="py-1 font-semibold">
                        {label}
                      </span>
                    ))}
                    {miniMonthGrid.map((cell, index) => {
                      const isToday = cell.iso === todayIso;
                      const isWeek = !!cell.iso && weekDateSet.has(cell.iso);
                      const planned = cell.iso ? allocatedByDate[cell.iso] || 0 : 0;
                      return (
                        <div
                          key={`${cell.iso || "blank"}-${index}`}
                          className={`rounded-lg py-1 text-[11px] ${
                            cell.day ? "bg-[#f5f8fa] text-[var(--ink)]" : "bg-transparent"
                          } ${isWeek ? "ring-1 ring-[var(--primary)]/35" : ""} ${
                            isToday ? "font-semibold text-[var(--primary)]" : ""
                          }`}
                        >
                          {cell.day || ""}
                          {planned > 0 ? (
                            <span className="ml-1 rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[9px] text-white">
                              {planned}h
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_25px_rgba(22,38,52,0.07)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWeekAnchor(startOfDay(new Date()))}
                      className="rounded-xl border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekAnchor((current) => addDays(current, -7))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekAnchor((current) => addDays(current, 7))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <h3 className="pl-1 text-lg font-semibold text-[var(--ink)]">
                      {monthFormatter.format(weekAnchor)}
                    </h3>
                    <span className="rounded-full bg-[#eef2f7] px-2 py-0.5 text-xs text-[var(--ink-soft)]">
                      {weekLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleGeneratePlan()}
                      disabled={generating}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                    >
                      {generating ? <Clock3 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      Generate Study Plan
                    </button>
                    <span className="rounded-full bg-[#ecf8f1] px-2 py-0.5 text-xs font-semibold text-[var(--success)]">
                      {weekPlannedHours}h planned
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[1020px]">
                    <div className="grid grid-cols-[74px_repeat(7,minmax(0,1fr))] border border-[var(--line)]">
                      <div className="border-r border-[var(--line)] bg-[#f7fafc] p-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                        GMT
                      </div>
                      {weekDays.map((day) => {
                        const iso = toIsoDate(day);
                        const hours = allocatedByDate[iso] || 0;
                        const isToday = iso === todayIso;
                        return (
                          <div
                            key={iso}
                            className={`border-r border-[var(--line)] p-2 text-center last:border-r-0 ${
                              isToday ? "bg-[var(--primary-soft)]" : "bg-[#f7fafc]"
                            }`}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink-soft)]">
                              {dayFormatter.format(day)}
                            </p>
                            <p className={`text-xl font-semibold ${isToday ? "text-[var(--primary)]" : "text-[var(--ink)]"}`}>
                              {day.getDate()}
                            </p>
                            <p className="text-[11px] text-[var(--ink-soft)]">{hours}h planned</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-[74px_repeat(7,minmax(0,1fr))] border-x border-b border-[var(--line)]">
                      <div className="relative border-r border-[var(--line)] bg-[#fafcfe]" style={{ height: HOURS.length * HOUR_CELL_HEIGHT }}>
                        {HOURS.map((hour) => (
                          <div
                            key={`label-${hour}`}
                            className="absolute left-0 right-0 border-t border-[var(--line)]/65 px-1.5 pt-1 text-right text-[10px] text-[var(--ink-soft)]"
                            style={{ top: (hour - HOURS[0]) * HOUR_CELL_HEIGHT }}
                          >
                            {formatHour(hour)}
                          </div>
                        ))}
                      </div>

                      {weekDays.map((day) => {
                        const iso = toIsoDate(day);
                        const blocks = (blocksByDate[iso] || [])
                          .filter((block) => {
                            const linkedTask = taskMap.get(block.taskId);
                            return Boolean(linkedTask && linkedTask.status !== "DONE");
                          })
                          .slice()
                          .sort((a, b) => a.startHour - b.startHour);
                        return (
                          <div
                            key={`grid-${iso}`}
                            className="relative border-r border-[var(--line)] last:border-r-0"
                            style={{ height: HOURS.length * HOUR_CELL_HEIGHT }}
                          >
                            {HOURS.map((hour) => (
                              <button
                                key={`${iso}-${hour}`}
                                type="button"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => handleDropOnSlot(iso, hour)}
                                className="absolute left-0 right-0 border-t border-[var(--line)]/70 transition hover:bg-[var(--primary-soft)]/40"
                                style={{
                                  top: (hour - HOURS[0]) * HOUR_CELL_HEIGHT,
                                  height: HOUR_CELL_HEIGHT,
                                }}
                              />
                            ))}

                            {blocks.map((block) => {
                              const task = taskMap.get(block.taskId);
                              if (!task) return null;

                              const blockTop = (block.startHour - HOURS[0]) * HOUR_CELL_HEIGHT + 2;
                              const blockHeight = block.durationHours * HOUR_CELL_HEIGHT - 4;
                              const startText = formatHour(block.startHour);
                              const endText = formatHour(block.startHour + block.durationHours);

                              return (
                                <article
                                  key={block.id}
                                  draggable
                                  onDragStart={() => {
                                    dragPayloadRef.current = { type: "event", eventId: block.id };
                                  }}
                                  onDragEnd={() => {
                                    dragPayloadRef.current = null;
                                  }}
                                  className="absolute left-1 right-1 z-10 cursor-grab rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] p-2 text-left shadow-[0_8px_15px_rgba(45,67,204,0.18)] active:cursor-grabbing"
                                  style={{ top: blockTop, height: blockHeight }}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <p className="line-clamp-2 text-xs font-semibold text-[var(--ink)]">
                                      {task.title}
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void markTaskDone(task.id);
                                        }}
                                        disabled={markingDoneTaskId !== null}
                                        className="rounded-md p-0.5 text-[var(--ink-soft)] hover:bg-white/70 disabled:opacity-60"
                                        title={markingDoneTaskId === task.id ? "Saving..." : "Mark done"}
                                      >
                                        {markingDoneTaskId === task.id ? (
                                          <Clock3 size={12} className="animate-spin" />
                                        ) : (
                                          <Check size={12} />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeScheduledBlock(block.id);
                                        }}
                                        className="rounded-md p-0.5 text-[var(--ink-soft)] hover:bg-white/70"
                                        title="Remove from calendar"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="mt-1 text-[10px] text-[var(--ink-soft)]">
                                    {startText} - {endText}
                                  </p>
                                  <div className="mt-1.5 flex items-center justify-between text-[10px]">
                                    <span className={`rounded-full px-1.5 py-0.5 ${priorityBadge(task.priority)}`}>
                                      {task.priority}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          updateBlockDuration(block.id, -1);
                                        }}
                                        className="rounded-md border border-[var(--line)] bg-white px-1.5 py-0.5 text-[var(--ink-soft)]"
                                      >
                                        -
                                      </button>
                                      <span className="min-w-8 text-center text-[var(--ink)]">
                                        {block.durationHours}h
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          updateBlockDuration(block.id, 1);
                                        }}
                                        className="rounded-md border border-[var(--line)] bg-white px-1.5 py-0.5 text-[var(--ink-soft)]"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "board" ? (
            <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
              <section className="space-y-4">
                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_22px_rgba(22,38,52,0.08)]">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    Pin Tasks
                  </h3>
                  <select
                    value={activePinnedTaskId}
                    onChange={(event) => setSelectedTaskToPin(event.target.value)}
                    className="w-full rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  >
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => pinTaskToBoard(activePinnedTaskId)}
                    disabled={!activePinnedTaskId}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
                  >
                    <Pin size={14} />
                    Pin task card
                  </button>
                </article>

                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-[0_10px_22px_rgba(22,38,52,0.08)]">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                    Pin Note Images
                  </h3>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line-strong)] bg-[#f8fbfd] px-3 py-6 text-sm text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                    <ImagePlus size={16} />
                    Upload note images
                    <input type="file" accept="image/*" multiple onChange={handleBoardImageUpload} className="hidden" />
                  </label>
                  <p className="mt-2 text-xs text-[var(--ink-soft)]">
                    Pinboard items can be moved freely like a real wall board.
                  </p>
                </article>
              </section>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 shadow-[0_10px_25px_rgba(22,38,52,0.07)]">
                <div
                  ref={boardRef}
                  className="relative h-[70vh] overflow-hidden rounded-2xl border border-[var(--line)] bg-[radial-gradient(circle_at_20%_20%,rgba(203,219,232,0.25),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(151,188,226,0.22),transparent_44%),linear-gradient(180deg,#fefefe_0%,#f4f8fc_100%)]"
                >
                  {boardItems.map((item) => {
                    const linkedTask = item.taskId ? taskMap.get(item.taskId) : null;
                    const isDragging = draggingBoardItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        onPointerDown={(event) => beginBoardDrag(event, item.id)}
                        className={`absolute rounded-xl border shadow-[0_14px_20px_rgba(40,58,77,0.14)] ${
                          isDragging ? "z-40 cursor-grabbing" : "z-20 cursor-grab"
                        }`}
                        style={{
                          left: item.x,
                          top: item.y,
                          width: item.width,
                          height: item.height,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => removeBoardItem(item.id)}
                          className="absolute right-1 top-1 z-20 rounded-md bg-black/45 p-1 text-white hover:bg-black/65"
                        >
                          <X size={11} />
                        </button>

                        {item.type === "task" ? (
                          <div className="h-full rounded-xl border border-[#ead68e] bg-[#fff8d6] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[#8b7326]">
                              Task Pin
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[#372e18]">
                              {linkedTask?.title || item.title}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="rounded-full bg-white px-2 py-0.5 text-[#5b4f2d]">
                                {linkedTask?.subject || "General"}
                              </span>
                              {linkedTask ? (
                                <span className={`rounded-full px-2 py-0.5 ${priorityBadge(linkedTask.priority)}`}>
                                  {linkedTask.priority}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-[11px] text-[#705c29]">
                              {linkedTask?.description || "Drag anywhere on the board."}
                            </p>
                          </div>
                        ) : (
                          <div className="relative h-full overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                            {item.imageDataUrl ? (
                              <Image
                                src={item.imageDataUrl}
                                alt={item.title}
                                fill
                                unoptimized
                                sizes="230px"
                                className="object-cover"
                              />
                            ) : null}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 text-[10px] text-white">
                              {item.title}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!boardItems.length ? (
                    <div className="absolute inset-0 grid place-items-center p-6">
                      <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/80 px-6 py-8 text-center">
                        <p className="text-sm font-semibold text-[var(--ink)]">Board is empty</p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          Pin task cards or upload note images, then drag them anywhere.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "focus" ? (
            <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
              <section className="space-y-4">
                <article className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_10px_25px_rgba(22,38,52,0.07)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-soft)]">
                    Pomodoro Timer
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Phase:{" "}
                    <span className={`font-semibold ${focusPhase === "focus" ? "text-[var(--primary)]" : "text-[var(--warning)]"}`}>
                      {focusPhase === "focus" ? "Focus" : "Break"}
                    </span>
                  </p>
                  <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[#f9fbfe] p-6 text-center">
                    <p className="text-6xl font-semibold tracking-[0.03em] text-[var(--ink)]">
                      {formatCountdown(pomodoroSecondsLeft)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <label className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-xs text-[var(--ink-soft)]">
                      Focus Minutes
                      <input
                        type="number"
                        min={10}
                        max={90}
                        value={focusMinutes}
                        onChange={(event) => {
                          const next = clamp(Number(event.target.value) || 25, 10, 90);
                          setFocusMinutes(next);
                          if (!timerRunning && focusPhase === "focus") {
                            setPomodoroSecondsLeft(next * 60);
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none"
                      />
                    </label>
                    <label className="rounded-xl border border-[var(--line)] bg-[#fbfdfe] px-3 py-2 text-xs text-[var(--ink-soft)]">
                      Break Minutes
                      <input
                        type="number"
                        min={3}
                        max={30}
                        value={breakMinutes}
                        onChange={(event) => {
                          const next = clamp(Number(event.target.value) || 5, 3, 30);
                          setBreakMinutes(next);
                          if (!timerRunning && focusPhase === "break") {
                            setPomodoroSecondsLeft(next * 60);
                          }
                        }}
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm text-[var(--ink)] outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTimerRunning((running) => !running)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"
                    >
                      {timerRunning ? <Pause size={14} /> : <Play size={14} />}
                      {timerRunning ? "Pause" : "Start"}
                    </button>
                    <button
                      type="button"
                      onClick={resetPomodoro}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink-soft)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    >
                      <TimerReset size={14} />
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={enterFocusMode}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--primary)]"
                    >
                      <CalendarDays size={14} />
                      Enter Focus Screen
                    </button>
                  </div>
                </article>

                <article className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 text-center">
                    <p className="text-xs text-[var(--ink-soft)]">Today</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--ink)]">
                      {formatFocusHours(focusLogSeconds[todayIso] || 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 text-center">
                    <p className="text-xs text-[var(--ink-soft)]">Total</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--ink)]">{formatFocusHours(totalFocusSeconds)}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 text-center">
                    <p className="text-xs text-[var(--ink-soft)]">Sessions</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--ink)]">{completedPomodoros}</p>
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-[0_10px_25px_rgba(22,38,52,0.07)]">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--ink)]">Focus Heatmap</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--ink-soft)]">
                    <span>Less</span>
                    {[0, 1, 2, 3, 4].map((level) => (
                      <span key={`legend-${level}`} className={`h-3 w-3 rounded-sm ${heatColor(level * 15 * 60)}`} />
                    ))}
                    <span>More</span>
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto rounded-xl border border-[var(--line)] bg-[#f9fbfe] p-3">
                  <div className="grid grid-rows-7 gap-1 pt-5 text-[10px] text-[var(--ink-soft)]">
                    {DAY_ROW_LABELS.map((label, index) => (
                      <span
                        key={`row-${label}-${index}`}
                        className={`flex h-3.5 items-center ${
                          index === 0 ? "font-semibold text-[#bf476f]" : "text-[var(--ink-soft)]"
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="min-w-max">
                    <div className="mb-1 grid grid-flow-col auto-cols-[14px] gap-1 text-[10px] leading-none text-[var(--ink-soft)]">
                      {heatmapWeeks.map((week, weekIndex) => (
                        <span
                          key={`year-${week.key}`}
                          className={`h-4 whitespace-nowrap ${
                            week.yearStart ? "pl-1 font-semibold text-[var(--ink)]" : ""
                          } ${
                            week.yearStart && weekIndex > 0
                              ? "ml-4 border-l-2 border-[var(--line-strong)] pl-2"
                              : ""
                          }`}
                        >
                          {week.yearStart ? week.year : ""}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-flow-col auto-cols-[14px] grid-rows-7 gap-1">
                      {heatmapWeeks.map((week, weekIndex) =>
                        week.days.map((cell) => (
                          <div
                            key={cell.iso}
                            className={`h-3.5 w-3.5 rounded-[3px] ${
                              cell.isPlaceholder
                                ? "border border-transparent bg-transparent"
                                : `border border-black/5 ${heatColor(cell.seconds, cell.isSunday)}`
                            } ${
                              week.yearStart && weekIndex > 0 ? "ml-4 border-l-2 border-l-[var(--line-strong)]" : ""
                            }`}
                            title={cell.isPlaceholder ? undefined : `${cell.label}: ${Math.round(cell.seconds / 60)} min`}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </AppShell>

      {focusOverlay ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-[#f7f9fc]">
          <p className="text-[20vw] font-semibold leading-none tracking-[0.05em] text-[var(--ink)]">
            {formatCountdown(pomodoroSecondsLeft)}
          </p>
        </div>
      ) : null}
    </>
  );
}
