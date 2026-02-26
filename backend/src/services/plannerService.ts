import pool from '../db/connection';
import { ChatMessage, getAIProvider } from './aiProvider';

export type TaskStatus = 'TODO' | 'DOING' | 'PROCRASTINATED' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type SessionStatus = 'PLANNED' | 'DONE' | 'SKIPPED';

export interface PlannerTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  subject: string | null;
  deadline: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  ai_generated: boolean;
  position: number;
  estimated_minutes: number | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannerSession {
  id: string;
  user_id: string;
  task_id: string | null;
  title: string;
  subject: string | null;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: SessionStatus;
  ai_generated: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type JsonRecord = Record<string, unknown>;

const TASK_STATUS: TaskStatus[] = ['TODO', 'DOING', 'PROCRASTINATED', 'DONE'];
const TASK_PRIORITY: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
const SESSION_STATUS: SessionStatus[] = ['PLANNED', 'DONE', 'SKIPPED'];

let schemaReady: Promise<void> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOr(input?: string, fallback?: string): string {
  if (input && isDate(input)) return input;
  if (fallback && isDate(fallback)) return fallback;
  return today();
}

function nstr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function ndate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = v.trim().slice(0, 10);
  return isDate(d) ? d : null;
}

function nstatus(v: unknown): TaskStatus {
  const s = typeof v === 'string' ? (v.toUpperCase() as TaskStatus) : 'TODO';
  return TASK_STATUS.includes(s) ? s : 'TODO';
}

function npriority(v: unknown): TaskPriority {
  const s = typeof v === 'string' ? (v.toUpperCase() as TaskPriority) : 'MEDIUM';
  return TASK_PRIORITY.includes(s) ? s : 'MEDIUM';
}

function nsession(v: unknown): SessionStatus {
  const s = typeof v === 'string' ? (v.toUpperCase() as SessionStatus) : 'PLANNED';
  return SESSION_STATUS.includes(s) ? s : 'PLANNED';
}

function mapTask(row: JsonRecord): PlannerTask {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    subject: row.subject == null ? null : String(row.subject),
    deadline: ndate(row.deadline),
    status: nstatus(row.status),
    priority: npriority(row.priority),
    ai_generated: Boolean(row.ai_generated),
    position: Number(row.position || 0),
    estimated_minutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
    parent_task_id: row.parent_task_id == null ? null : String(row.parent_task_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSession(row: JsonRecord): PlannerSession {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    task_id: row.task_id == null ? null : String(row.task_id),
    title: String(row.title),
    subject: row.subject == null ? null : String(row.subject),
    start_at: String(row.start_at),
    end_at: String(row.end_at),
    duration_minutes: Number(row.duration_minutes || 0),
    status: nsession(row.status),
    ai_generated: Boolean(row.ai_generated),
    notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function ts(date: string, time: string): string {
  return `${date} ${time}:00`;
}

function endTs(date: string, time: string, minutes: number): string {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}

function addDays(iso: string, amount: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

function dateRange(start: string, end: string): string[] {
  const list: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    list.push(cursor);
    cursor = addDays(cursor, 1);
    if (list.length > 370) break;
  }
  return list.length ? list : [start];
}

function cleanJson(raw: string): JsonRecord | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as JsonRecord;
  } catch {
    return null;
  }
}

export async function ensurePlannerSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INT;`);
    await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_user_parent ON tasks(user_id, parent_task_id);`);
    await pool.query(`
      DO $$
      DECLARE
        constraint_name text;
      BEGIN
        FOR constraint_name IN
          SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'tasks'
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) ILIKE '%status IN%'
        LOOP
          EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS %I', constraint_name);
        END LOOP;

        BEGIN
          ALTER TABLE tasks
          ADD CONSTRAINT tasks_status_check
          CHECK (status IN ('TODO','DOING','PROCRASTINATED','DONE'));
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
      END
      $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planner_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        subject VARCHAR(100),
        start_at TIMESTAMP NOT NULL,
        end_at TIMESTAMP NOT NULL,
        duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','DONE','SKIPPED')),
        ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_planner_sessions_user_start ON planner_sessions(user_id, start_at);`);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function syncProcrastinatedTasks(userId: string): Promise<void> {
  await pool.query(
    `UPDATE tasks
     SET status='PROCRASTINATED', updated_at=NOW()
     WHERE user_id=$1
       AND status IN ('TODO','DOING')
       AND deadline IS NOT NULL
       AND deadline < CURRENT_DATE`,
    [userId]
  );
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  subject?: string | null;
  deadline?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  aiGenerated?: boolean;
  estimatedMinutes?: number | null;
  parentTaskId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  subject?: string | null;
  deadline?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  parentTaskId?: string | null;
}

export interface CreateSessionInput {
  taskId?: string | null;
  title: string;
  subject?: string | null;
  date: string;
  startTime: string;
  durationMinutes: number;
  status?: SessionStatus;
  notes?: string | null;
  aiGenerated?: boolean;
}

export interface UpdateSessionInput {
  title?: string;
  subject?: string | null;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  status?: SessionStatus;
  notes?: string | null;
}

export async function listTasks(
  userId: string,
  filters: { status?: string; subject?: string; startDate?: string; endDate?: string; parentTaskId?: string } = {}
): Promise<PlannerTask[]> {
  await ensurePlannerSchema();
  await syncProcrastinatedTasks(userId);
  const where: string[] = ['user_id = $1'];
  const values: Array<string | null> = [userId];
  let idx = 2;

  if (filters.status) {
    where.push(`status = $${idx++}`);
    values.push(nstatus(filters.status));
  }
  if (filters.subject) {
    where.push(`subject = $${idx++}`);
    values.push(filters.subject);
  }
  if (filters.parentTaskId) {
    where.push(`parent_task_id = $${idx++}`);
    values.push(filters.parentTaskId);
  }
  if (filters.startDate && isDate(filters.startDate)) {
    where.push(`deadline >= $${idx++}::date`);
    values.push(filters.startDate);
  }
  if (filters.endDate && isDate(filters.endDate)) {
    where.push(`deadline <= $${idx++}::date`);
    values.push(filters.endDate);
  }

  const result = await pool.query(
    `SELECT id, user_id, title, description, subject, deadline, status, priority, ai_generated, position,
            estimated_minutes, parent_task_id, created_at, updated_at
     FROM tasks
     WHERE ${where.join(' AND ')}
     ORDER BY CASE status WHEN 'TODO' THEN 1 WHEN 'DOING' THEN 2 WHEN 'PROCRASTINATED' THEN 3 WHEN 'DONE' THEN 4 ELSE 5 END,
              position ASC, deadline ASC NULLS LAST, created_at DESC`,
    values
  );

  return result.rows.map((r) => mapTask(r as JsonRecord));
}

export async function createTask(userId: string, input: CreateTaskInput): Promise<PlannerTask> {
  await ensurePlannerSchema();
  const title = nstr(input.title);
  if (!title) throw new Error('Title is required.');

  const status = nstatus(input.status);
  const priority = npriority(input.priority);
  const nextPos = await pool.query(`SELECT COALESCE(MAX(position),-1)+1 AS pos FROM tasks WHERE user_id=$1 AND status=$2`, [userId, status]);

  const result = await pool.query(
    `INSERT INTO tasks (user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, user_id, title, description, subject, deadline, status, priority, ai_generated, position,
               estimated_minutes, parent_task_id, created_at, updated_at`,
    [
      userId,
      title,
      nstr(input.description, '') || null,
      nstr(input.subject, 'General') || null,
      ndate(input.deadline),
      status,
      priority,
      Boolean(input.aiGenerated),
      Number(nextPos.rows[0]?.pos || 0),
      input.estimatedMinutes == null ? null : clamp(Number(input.estimatedMinutes), 1, 2000),
      nstr(input.parentTaskId, '') || null,
    ]
  );

  return mapTask(result.rows[0] as JsonRecord);
}

export async function updateTask(userId: string, taskId: string, input: UpdateTaskInput): Promise<PlannerTask | null> {
  await ensurePlannerSchema();
  const set: string[] = [];
  const vals: Array<string | number | null> = [];
  let idx = 1;

  if (input.title !== undefined) {
    const title = nstr(input.title);
    if (!title) throw new Error('Title cannot be empty.');
    set.push(`title=$${idx++}`);
    vals.push(title);
  }
  if (input.description !== undefined) {
    set.push(`description=$${idx++}`);
    vals.push(nstr(input.description, '') || null);
  }
  if (input.subject !== undefined) {
    set.push(`subject=$${idx++}`);
    vals.push(nstr(input.subject, '') || null);
  }
  if (input.deadline !== undefined) {
    set.push(`deadline=$${idx++}`);
    vals.push(ndate(input.deadline));
  }
  if (input.status !== undefined) {
    set.push(`status=$${idx++}`);
    vals.push(nstatus(input.status));
  }
  if (input.priority !== undefined) {
    set.push(`priority=$${idx++}`);
    vals.push(npriority(input.priority));
  }
  if (input.estimatedMinutes !== undefined) {
    set.push(`estimated_minutes=$${idx++}`);
    vals.push(input.estimatedMinutes == null ? null : clamp(Number(input.estimatedMinutes), 1, 2000));
  }
  if (input.parentTaskId !== undefined) {
    set.push(`parent_task_id=$${idx++}`);
    vals.push(nstr(input.parentTaskId, '') || null);
  }

  if (!set.length) return null;
  set.push('updated_at=NOW()');

  vals.push(taskId, userId);
  const result = await pool.query(
    `UPDATE tasks SET ${set.join(', ')} WHERE id=$${idx++} AND user_id=$${idx++}
     RETURNING id, user_id, title, description, subject, deadline, status, priority, ai_generated, position,
               estimated_minutes, parent_task_id, created_at, updated_at`,
    vals
  );

  return result.rows.length ? mapTask(result.rows[0] as JsonRecord) : null;
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  await ensurePlannerSchema();
  await pool.query(`DELETE FROM planner_sessions WHERE user_id=$1 AND task_id=$2`, [userId, taskId]);
  const result = await pool.query(`DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING id`, [taskId, userId]);
  return result.rows.length > 0;
}

export async function reorderTask(userId: string, taskId: string, newStatus: TaskStatus, newPosition: number): Promise<void> {
  await ensurePlannerSchema();
  const status = nstatus(newStatus);
  const pos = clamp(Number(newPosition) || 0, 0, 10000);
  await pool.query(`UPDATE tasks SET position = position + 1 WHERE user_id=$1 AND status=$2 AND position >= $3 AND id <> $4`, [userId, status, pos, taskId]);
  await pool.query(`UPDATE tasks SET status=$1, position=$2, updated_at=NOW() WHERE id=$3 AND user_id=$4`, [status, pos, taskId, userId]);
}

export async function getTaskStats(userId: string): Promise<{
  total: number;
  todo: number;
  doing: number;
  procrastinated: number;
  done: number;
  completedToday: number;
  overdue: number;
  todayTasks: PlannerTask[];
  subjectBreakdown: Array<{ subject: string; status: TaskStatus; count: number }>;
}> {
  await ensurePlannerSchema();
  await syncProcrastinatedTasks(userId);

  const [a, b, c, d, e] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM tasks WHERE user_id=$1 GROUP BY status`, [userId]),
    pool.query(`SELECT id, user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id, created_at, updated_at FROM tasks WHERE user_id=$1 AND deadline=CURRENT_DATE ORDER BY CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, position ASC`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE user_id=$1 AND status='DONE' AND updated_at::date=CURRENT_DATE`, [userId]),
    pool.query(`SELECT COUNT(*)::int AS count FROM tasks WHERE user_id=$1 AND status='PROCRASTINATED'`, [userId]),
    pool.query(`SELECT COALESCE(subject,'General') AS subject, status, COUNT(*)::int AS count FROM tasks WHERE user_id=$1 GROUP BY COALESCE(subject,'General'), status ORDER BY subject`, [userId]),
  ]);

  const s = { TODO: 0, DOING: 0, PROCRASTINATED: 0, DONE: 0 };
  for (const row of a.rows as JsonRecord[]) s[nstatus(row.status)] = Number(row.count || 0);

  return {
    total: s.TODO + s.DOING + s.PROCRASTINATED + s.DONE,
    todo: s.TODO,
    doing: s.DOING,
    procrastinated: s.PROCRASTINATED,
    done: s.DONE,
    completedToday: Number((c.rows[0] as JsonRecord | undefined)?.count || 0),
    overdue: Number((d.rows[0] as JsonRecord | undefined)?.count || 0),
    todayTasks: b.rows.map((r) => mapTask(r as JsonRecord)),
    subjectBreakdown: e.rows.map((r) => ({
      subject: String((r as JsonRecord).subject || 'General'),
      status: nstatus((r as JsonRecord).status),
      count: Number((r as JsonRecord).count || 0),
    })),
  };
}

export async function createSession(userId: string, input: CreateSessionInput): Promise<PlannerSession> {
  await ensurePlannerSchema();
  if (!isDate(input.date)) throw new Error('date must be YYYY-MM-DD');
  if (!isTime(input.startTime)) throw new Error('startTime must be HH:MM');
  const title = nstr(input.title);
  if (!title) throw new Error('title is required');
  const duration = clamp(Number(input.durationMinutes) || 0, 15, 360);

  const result = await pool.query(
    `INSERT INTO planner_sessions (user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes)
     VALUES ($1,$2,$3,$4,$5::timestamp,$6::timestamp,$7,$8,$9,$10)
     RETURNING id, user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes, created_at, updated_at`,
    [
      userId,
      nstr(input.taskId, '') || null,
      title,
      nstr(input.subject, '') || null,
      ts(input.date, input.startTime),
      endTs(input.date, input.startTime, duration),
      duration,
      nsession(input.status),
      Boolean(input.aiGenerated),
      nstr(input.notes, '') || null,
    ]
  );

  return mapSession(result.rows[0] as JsonRecord);
}

export async function listSessions(userId: string, fromDate?: string, toDate?: string): Promise<PlannerSession[]> {
  await ensurePlannerSchema();
  const from = dateOr(fromDate);
  const to = dateOr(toDate, from);
  const result = await pool.query(
    `SELECT id, user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes, created_at, updated_at
     FROM planner_sessions
     WHERE user_id=$1 AND start_at::date >= $2::date AND start_at::date <= $3::date
     ORDER BY start_at ASC`,
    [userId, from, to]
  );
  return result.rows.map((r) => mapSession(r as JsonRecord));
}

export async function updateSession(userId: string, sessionId: string, input: UpdateSessionInput): Promise<PlannerSession | null> {
  await ensurePlannerSchema();
  const currentRes = await pool.query(`SELECT * FROM planner_sessions WHERE id=$1 AND user_id=$2 LIMIT 1`, [sessionId, userId]);
  if (!currentRes.rows.length) return null;
  const curr = currentRes.rows[0] as JsonRecord;
  const currStart = String(curr.start_at);

  const date = input.date && isDate(input.date) ? input.date : currStart.slice(0, 10);
  const time = input.startTime && isTime(input.startTime) ? input.startTime : currStart.slice(11, 16);
  const duration = input.durationMinutes !== undefined ? clamp(Number(input.durationMinutes) || 0, 15, 360) : clamp(Number(curr.duration_minutes) || 60, 15, 360);
  const title = input.title !== undefined ? nstr(input.title) : nstr(curr.title);
  if (!title) throw new Error('title cannot be empty');

  const result = await pool.query(
    `UPDATE planner_sessions
     SET title=$1, subject=$2, start_at=$3::timestamp, end_at=$4::timestamp, duration_minutes=$5, status=$6, notes=$7, updated_at=NOW()
     WHERE id=$8 AND user_id=$9
     RETURNING id, user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes, created_at, updated_at`,
    [
      title,
      input.subject !== undefined ? nstr(input.subject, '') || null : (curr.subject == null ? null : String(curr.subject)),
      ts(date, time),
      endTs(date, time, duration),
      duration,
      input.status !== undefined ? nsession(input.status) : nsession(curr.status),
      input.notes !== undefined ? nstr(input.notes, '') || null : (curr.notes == null ? null : String(curr.notes)),
      sessionId,
      userId,
    ]
  );

  return result.rows.length ? mapSession(result.rows[0] as JsonRecord) : null;
}

export async function deleteSession(userId: string, sessionId: string): Promise<boolean> {
  await ensurePlannerSchema();
  const result = await pool.query(`DELETE FROM planner_sessions WHERE id=$1 AND user_id=$2 RETURNING id`, [sessionId, userId]);
  return result.rows.length > 0;
}

interface SessionWithTime extends PlannerSession {
  date: string;
  start_time: string;
  end_time: string;
}

async function sessionsWithTimes(userId: string, from: string, to: string): Promise<SessionWithTime[]> {
  const result = await pool.query(
    `SELECT id, user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes, created_at, updated_at,
            to_char(start_at, 'YYYY-MM-DD') AS date,
            to_char(start_at, 'HH24:MI') AS start_time,
            to_char(end_at, 'HH24:MI') AS end_time
     FROM planner_sessions
     WHERE user_id=$1 AND start_at::date >= $2::date AND start_at::date <= $3::date
     ORDER BY start_at ASC`,
    [userId, from, to]
  );

  return result.rows.map((r) => {
    const base = mapSession(r as JsonRecord);
    const row = r as JsonRecord;
    return { ...base, date: String(row.date), start_time: String(row.start_time), end_time: String(row.end_time) };
  });
}

function hourlyBuckets(sessions: SessionWithTime[]) {
  const buckets = Array.from({ length: 24 }).map((_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    totalMinutes: 0,
    sessions: [] as Array<{
      id: string;
      title: string;
      subject: string | null;
      status: SessionStatus;
      startTime: string;
      endTime: string;
      overlapMinutes: number;
    }>,
  }));

  for (const s of sessions) {
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    const st = sh * 60 + sm;
    const et = eh * 60 + em;

    for (let h = 0; h < 24; h++) {
      const hs = h * 60;
      const he = hs + 60;
      const overlap = Math.max(0, Math.min(et, he) - Math.max(st, hs));
      if (overlap <= 0) continue;
      buckets[h].totalMinutes += overlap;
      buckets[h].sessions.push({
        id: s.id,
        title: s.title,
        subject: s.subject,
        status: s.status,
        startTime: s.start_time,
        endTime: s.end_time,
        overlapMinutes: overlap,
      });
    }
  }

  return buckets;
}

export async function getDailyCalendar(userId: string, dateInput?: string): Promise<{
  date: string;
  tasksDue: PlannerTask[];
  sessions: PlannerSession[];
  totalPlannedMinutes: number;
  hourly: ReturnType<typeof hourlyBuckets>;
}> {
  await ensurePlannerSchema();
  await syncProcrastinatedTasks(userId);
  const date = dateOr(dateInput);
  const [taskRows, sessRows] = await Promise.all([
    pool.query(
      `SELECT id, user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id, created_at, updated_at
       FROM tasks
       WHERE user_id=$1 AND deadline=$2::date
       ORDER BY CASE priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, position ASC`,
      [userId, date]
    ),
    sessionsWithTimes(userId, date, date),
  ]);

  const sessions: PlannerSession[] = sessRows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    task_id: r.task_id,
    title: r.title,
    subject: r.subject,
    start_at: r.start_at,
    end_at: r.end_at,
    duration_minutes: r.duration_minutes,
    status: r.status,
    ai_generated: r.ai_generated,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return {
    date,
    tasksDue: taskRows.rows.map((r) => mapTask(r as JsonRecord)),
    sessions,
    totalPlannedMinutes: sessions.reduce((sum, s) => sum + s.duration_minutes, 0),
    hourly: hourlyBuckets(sessRows),
  };
}

export async function getHourlyCalendar(userId: string, dateInput?: string) {
  return getDailyCalendar(userId, dateInput);
}

export async function getWeeklyCalendar(userId: string, anchorDate?: string): Promise<{
  weekStart: string;
  weekEnd: string;
  days: Array<{
    date: string;
    weekday: string;
    tasksDue: PlannerTask[];
    sessions: PlannerSession[];
    totalPlannedMinutes: number;
  }>;
}> {
  await ensurePlannerSchema();
  await syncProcrastinatedTasks(userId);
  const anchor = new Date(`${dateOr(anchorDate)}T00:00:00`);
  const day = anchor.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  anchor.setDate(anchor.getDate() + diff);
  const weekStart = anchor.toISOString().slice(0, 10);
  const weekEnd = addDays(weekStart, 6);

  const [tasks, sessions] = await Promise.all([
    listTasks(userId, { startDate: weekStart, endDate: weekEnd }),
    sessionsWithTimes(userId, weekStart, weekEnd),
  ]);

  const days: Array<{
    date: string;
    weekday: string;
    tasksDue: PlannerTask[];
    sessions: PlannerSession[];
    totalPlannedMinutes: number;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const d = new Date(`${date}T00:00:00`);
    const dayTasks = tasks.filter((t) => t.deadline === date);
    const daySessionsRaw = sessions.filter((s) => s.date === date);
    const daySessions: PlannerSession[] = daySessionsRaw.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      task_id: r.task_id,
      title: r.title,
      subject: r.subject,
      start_at: r.start_at,
      end_at: r.end_at,
      duration_minutes: r.duration_minutes,
      status: r.status,
      ai_generated: r.ai_generated,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    days.push({
      date,
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      tasksDue: dayTasks,
      sessions: daySessions,
      totalPlannedMinutes: daySessions.reduce((sum, s) => sum + s.duration_minutes, 0),
    });
  }

  return { weekStart, weekEnd, days };
}

export async function getMonthlyCalendar(userId: string, yearInput?: number, monthInput?: number): Promise<{
  year: number;
  month: number;
  monthStart: string;
  monthEnd: string;
  days: Array<{
    date: string;
    day: number;
    taskCount: number;
    sessionCount: number;
    totalPlannedMinutes: number;
    completedSessions: number;
  }>;
}> {
  await ensurePlannerSchema();
  await syncProcrastinatedTasks(userId);
  const now = new Date();
  const year = clamp(Number(yearInput) || now.getFullYear(), 2000, 2100);
  const month = clamp(Number(monthInput) || now.getMonth() + 1, 1, 12);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const monthStart = first.toISOString().slice(0, 10);
  const monthEnd = last.toISOString().slice(0, 10);

  const [taskRows, sessionRows] = await Promise.all([
    pool.query(`SELECT deadline FROM tasks WHERE user_id=$1 AND deadline >= $2::date AND deadline <= $3::date`, [userId, monthStart, monthEnd]),
    pool.query(`SELECT to_char(start_at,'YYYY-MM-DD') AS date, duration_minutes, status FROM planner_sessions WHERE user_id=$1 AND start_at::date >= $2::date AND start_at::date <= $3::date`, [userId, monthStart, monthEnd]),
  ]);

  const taskMap = new Map<string, number>();
  for (const row of taskRows.rows as JsonRecord[]) {
    const key = ndate(row.deadline);
    if (!key) continue;
    taskMap.set(key, (taskMap.get(key) || 0) + 1);
  }

  const sessionMap = new Map<string, { count: number; minutes: number; completed: number }>();
  for (const row of sessionRows.rows as JsonRecord[]) {
    const key = String(row.date);
    const current = sessionMap.get(key) || { count: 0, minutes: 0, completed: 0 };
    current.count += 1;
    current.minutes += Number(row.duration_minutes || 0);
    if (nsession(row.status) === 'DONE') current.completed += 1;
    sessionMap.set(key, current);
  }

  const days: Array<{ date: string; day: number; taskCount: number; sessionCount: number; totalPlannedMinutes: number; completedSessions: number }> = [];
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month - 1, d).toISOString().slice(0, 10);
    const sess = sessionMap.get(date) || { count: 0, minutes: 0, completed: 0 };
    days.push({
      date,
      day: d,
      taskCount: taskMap.get(date) || 0,
      sessionCount: sess.count,
      totalPlannedMinutes: sess.minutes,
      completedSessions: sess.completed,
    });
  }

  return { year, month, monthStart, monthEnd, days };
}

export interface BreakdownInput {
  title: string;
  description?: string;
  subject?: string;
  startDate?: string;
  deadline?: string;
  estimatedHours?: number;
  hoursPerDay?: number;
  sessionMinutes?: number;
  persist?: boolean;
}

export interface ExamPlanInput {
  examDate: string;
  hoursPerDay: number;
  weakSubjects: string[];
  allSubjects?: string[];
  stream?: string;
  persist?: boolean;
}

interface GeneratedSubtask {
  title: string;
  description: string;
  subject: string;
  priority: TaskPriority;
  deadline: string;
  estimatedMinutes: number;
}

interface GeneratedSession {
  title: string;
  subtaskTitle: string;
  subject: string;
  date: string;
  startTime: string;
  durationMinutes: number;
}

interface GeneratedPlan {
  summary: string;
  subtasks: GeneratedSubtask[];
  sessions: GeneratedSession[];
}

function fallbackPlan(input: {
  title: string;
  subject: string;
  description: string;
  startDate: string;
  deadline: string;
  totalMinutes: number;
  sessionMinutes: number;
  weakSubjects?: string[];
}): GeneratedPlan {
  const days = dateRange(input.startDate, input.deadline);
  const steps = clamp(Math.round(input.totalMinutes / 90), 3, 12);
  const perStep = clamp(Math.round(input.totalMinutes / steps), 25, 240);

  const subtasks: GeneratedSubtask[] = [];
  for (let i = 0; i < steps; i++) {
    const dayIdx = Math.min(days.length - 1, Math.round((i / Math.max(1, steps - 1)) * (days.length - 1)));
    const forcedSubject =
      input.weakSubjects && input.weakSubjects.length > 0 && i < Math.ceil(steps * 0.6)
        ? input.weakSubjects[i % input.weakSubjects.length]
        : input.subject;
    subtasks.push({
      title: `${input.title} - Step ${i + 1}`,
      description: `Focus on step ${i + 1}. ${input.description}`.trim(),
      subject: forcedSubject,
      priority: i < Math.ceil(steps / 3) ? 'HIGH' : i < Math.ceil((2 * steps) / 3) ? 'MEDIUM' : 'LOW',
      deadline: days[dayIdx],
      estimatedMinutes: perStep,
    });
  }

  const slots = ['06:30', '08:00', '09:30', '14:00', '16:00', '18:00', '20:00'];
  let cursor = 0;
  const sessions: GeneratedSession[] = [];
  for (const st of subtasks) {
    let left = st.estimatedMinutes;
    while (left > 0) {
      const duration = Math.min(left, input.sessionMinutes);
      sessions.push({
        title: st.title,
        subtaskTitle: st.title,
        subject: st.subject,
        date: days[cursor % days.length],
        startTime: slots[cursor % slots.length],
        durationMinutes: duration,
      });
      left -= duration;
      cursor += 1;
    }
  }

  return {
    summary: `Generated fallback plan with ${subtasks.length} subtasks and ${sessions.length} sessions.`,
    subtasks,
    sessions,
  };
}

async function modelPlan(prompt: string): Promise<JsonRecord | null> {
  const ai = getAIProvider();
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Return strict JSON only.' },
    { role: 'user', content: prompt },
  ];
  try {
    const response = await ai.chat(messages, { temperature: 0.3, maxTokens: 3500 });
    return cleanJson(response);
  } catch (error) {
    const message = (error as { message?: string }).message || 'unknown';
    console.warn(`Planner generation failed: ${message}`);
    return null;
  }
}

function normalizePlan(raw: JsonRecord | null, fallback: GeneratedPlan, fallbackSubject: string): GeneratedPlan {
  if (!raw) return fallback;

  const subtasksRaw = Array.isArray(raw.subtasks) ? raw.subtasks : [];
  const sessionsRaw = Array.isArray(raw.sessions) ? raw.sessions : [];

  const subtasks: GeneratedSubtask[] = subtasksRaw
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as JsonRecord;
      return {
        title: nstr(r.title, `Task ${idx + 1}`),
        description: nstr(r.description, ''),
        subject: nstr(r.subject, fallbackSubject) || fallbackSubject,
        priority: npriority(r.priority),
        deadline: dateOr(
          typeof r.deadline === 'string' ? r.deadline.slice(0, 10) : undefined,
          fallback.subtasks[Math.min(idx, fallback.subtasks.length - 1)]?.deadline
        ),
        estimatedMinutes: clamp(Number(r.estimatedMinutes) || 60, 15, 360),
      };
    })
    .filter((x): x is GeneratedSubtask => x !== null && x.title.length > 0);

  const sessions: GeneratedSession[] = sessionsRaw
    .map((row, idx) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as JsonRecord;
      const startTime = isTime(nstr(r.startTime)) ? nstr(r.startTime) : '07:00';
      return {
        title: nstr(r.title, `Session ${idx + 1}`),
        subtaskTitle: nstr(r.subtaskTitle, nstr(r.title, '')),
        subject: nstr(r.subject, fallbackSubject) || fallbackSubject,
        date: dateOr(
          typeof r.date === 'string' ? r.date.slice(0, 10) : undefined,
          fallback.sessions[Math.min(idx, fallback.sessions.length - 1)]?.date
        ),
        startTime,
        durationMinutes: clamp(Number(r.durationMinutes) || 60, 15, 300),
      };
    })
    .filter((x): x is GeneratedSession => x !== null && x.title.length > 0);

  return {
    summary: nstr(raw.summary, fallback.summary) || fallback.summary,
    subtasks: subtasks.length ? subtasks : fallback.subtasks,
    sessions: sessions.length ? sessions : fallback.sessions,
  };
}

async function insertGenerated(
  userId: string,
  parentTitle: string,
  parentDescription: string,
  parentSubject: string,
  parentDeadline: string,
  totalMinutes: number,
  plan: GeneratedPlan
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const parentRes = await client.query(
      `INSERT INTO tasks (user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id)
       VALUES ($1,$2,$3,$4,$5::date,'TODO','HIGH',TRUE,COALESCE((SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE user_id=$1 AND status='TODO'),0),$6,NULL)
       RETURNING id, user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id, created_at, updated_at`,
      [userId, parentTitle, parentDescription || null, parentSubject || null, parentDeadline, totalMinutes]
    );

    const parent = mapTask(parentRes.rows[0] as JsonRecord);
    const subtasks: PlannerTask[] = [];
    const mapByTitle = new Map<string, string>();

    for (const st of plan.subtasks) {
      const row = await client.query(
        `INSERT INTO tasks (user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id)
         VALUES ($1,$2,$3,$4,$5::date,'TODO',$6,TRUE,COALESCE((SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE user_id=$1 AND status='TODO'),0),$7,$8)
         RETURNING id, user_id, title, description, subject, deadline, status, priority, ai_generated, position, estimated_minutes, parent_task_id, created_at, updated_at`,
        [userId, st.title, st.description || null, st.subject || null, st.deadline, st.priority, st.estimatedMinutes, parent.id]
      );
      const task = mapTask(row.rows[0] as JsonRecord);
      subtasks.push(task);
      mapByTitle.set(task.title.toLowerCase(), task.id);
    }

    const sessions: PlannerSession[] = [];
    for (const ss of plan.sessions) {
      const taskId = mapByTitle.get(ss.subtaskTitle.toLowerCase()) || mapByTitle.get(ss.title.toLowerCase()) || parent.id;
      const row = await client.query(
        `INSERT INTO planner_sessions (user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated)
         VALUES ($1,$2,$3,$4,$5::timestamp,$6::timestamp,$7,'PLANNED',TRUE)
         RETURNING id, user_id, task_id, title, subject, start_at, end_at, duration_minutes, status, ai_generated, notes, created_at, updated_at`,
        [userId, taskId, ss.title, ss.subject || null, ts(ss.date, ss.startTime), endTs(ss.date, ss.startTime, ss.durationMinutes), ss.durationMinutes]
      );
      sessions.push(mapSession(row.rows[0] as JsonRecord));
    }

    await client.query('COMMIT');
    return { parentTask: parent, subtasks, sessions };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function generateTaskBreakdown(userId: string, input: BreakdownInput): Promise<{
  summary: string;
  usedFallback: boolean;
  parentTask: PlannerTask | null;
  subtasks: PlannerTask[] | GeneratedSubtask[];
  sessions: PlannerSession[] | GeneratedSession[];
}> {
  await ensurePlannerSchema();
  const title = nstr(input.title);
  if (!title) throw new Error('title is required');

  const subject = nstr(input.subject, 'General') || 'General';
  const description = nstr(input.description, '');
  const startDate = dateOr(input.startDate);
  const deadline = dateOr(input.deadline, addDays(startDate, 7));
  const estimatedHours = clamp(Number(input.estimatedHours) || 6, 1, 120);
  const sessionMinutes = clamp(Number(input.sessionMinutes) || 60, 25, 120);
  const totalMinutes = estimatedHours * 60;

  const fallback = fallbackPlan({
    title,
    subject,
    description,
    startDate,
    deadline,
    totalMinutes,
    sessionMinutes,
  });

  const prompt = `Build a study plan and split this task into detailed subtasks and timed sessions.
Title: ${title}
Subject: ${subject}
Description: ${description || 'N/A'}
Start Date: ${startDate}
Deadline: ${deadline}
Estimated Hours: ${estimatedHours}
Session Minutes: ${sessionMinutes}

Return ONLY JSON:
{
  "summary": "short summary",
  "subtasks": [
    {"title":"...","description":"...","subject":"...","priority":"HIGH|MEDIUM|LOW","deadline":"YYYY-MM-DD","estimatedMinutes":60}
  ],
  "sessions": [
    {"title":"...","subtaskTitle":"...","subject":"...","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":60}
  ]
}`;

  const generated = await modelPlan(prompt);
  const plan = normalizePlan(generated, fallback, subject);
  const usedFallback = generated == null;

  if (input.persist === false) {
    return { summary: plan.summary, usedFallback, parentTask: null, subtasks: plan.subtasks, sessions: plan.sessions };
  }

  const inserted = await insertGenerated(userId, title, description, subject, deadline, totalMinutes, plan);
  return { summary: plan.summary, usedFallback, parentTask: inserted.parentTask, subtasks: inserted.subtasks, sessions: inserted.sessions };
}

export async function generateExamSchedule(userId: string, input: ExamPlanInput): Promise<{
  summary: string;
  usedFallback: boolean;
  parentTask: PlannerTask | null;
  subtasks: PlannerTask[] | GeneratedSubtask[];
  sessions: PlannerSession[] | GeneratedSession[];
}> {
  await ensurePlannerSchema();
  if (!isDate(input.examDate)) throw new Error('examDate must be YYYY-MM-DD');

  const weakSubjects = (Array.isArray(input.weakSubjects) ? input.weakSubjects : []).map((s) => nstr(s)).filter(Boolean);
  if (!weakSubjects.length) throw new Error('weakSubjects must have at least one subject');

  const stream = nstr(input.stream, 'SEE') || 'SEE';
  const todayDate = today();
  const exam = new Date(`${input.examDate}T00:00:00`);
  const t = new Date(`${todayDate}T00:00:00`);
  const daysUntilExam = Math.max(1, Math.ceil((exam.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)));
  const horizonDays = clamp(daysUntilExam, 3, 30);
  const deadline = exam < new Date(`${addDays(todayDate, horizonDays - 1)}T00:00:00`) ? input.examDate : addDays(todayDate, horizonDays - 1);
  const hoursPerDay = clamp(Number(input.hoursPerDay) || 3, 1, 16);
  const totalMinutes = horizonDays * hoursPerDay * 60;

  const allSubjects = (Array.isArray(input.allSubjects) && input.allSubjects.length ? input.allSubjects : weakSubjects)
    .map((s) => nstr(s))
    .filter(Boolean);

  const fallback = fallbackPlan({
    title: `Exam Plan until ${input.examDate}`,
    subject: weakSubjects[0],
    description: `Focus weak subjects: ${weakSubjects.join(', ')}`,
    startDate: todayDate,
    deadline,
    totalMinutes,
    sessionMinutes: 60,
    weakSubjects,
  });

  const prompt = `Create exam study schedule for Nepali ${stream} student.
Today: ${todayDate}
Exam Date: ${input.examDate}
Days Until Exam: ${daysUntilExam}
Plan Horizon: ${horizonDays}
Hours Per Day: ${hoursPerDay}
Weak Subjects: ${weakSubjects.join(', ')}
All Subjects: ${allSubjects.join(', ')}

Rules:
- At least 60% time must go to weak subjects.
- Split into concrete subtasks and timed sessions.
- Sessions need date, startTime HH:MM and durationMinutes.
- Priority HIGH for weak-subject tasks.

Return ONLY JSON:
{
  "summary": "short summary",
  "subtasks": [
    {"title":"...","description":"...","subject":"...","priority":"HIGH|MEDIUM|LOW","deadline":"YYYY-MM-DD","estimatedMinutes":60}
  ],
  "sessions": [
    {"title":"...","subtaskTitle":"...","subject":"...","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":60}
  ]
}`;

  const generated = await modelPlan(prompt);
  const plan = normalizePlan(generated, fallback, weakSubjects[0]);
  const usedFallback = generated == null;

  if (input.persist === false) {
    return { summary: plan.summary, usedFallback, parentTask: null, subtasks: plan.subtasks, sessions: plan.sessions };
  }

  const inserted = await insertGenerated(
    userId,
    `Exam Plan until ${input.examDate}`,
    `Stream: ${stream}. Weak subjects: ${weakSubjects.join(', ')}`,
    weakSubjects[0],
    deadline,
    totalMinutes,
    plan
  );

  return { summary: plan.summary, usedFallback, parentTask: inserted.parentTask, subtasks: inserted.subtasks, sessions: inserted.sessions };
}
