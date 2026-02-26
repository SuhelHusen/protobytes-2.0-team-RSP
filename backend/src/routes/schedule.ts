import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createSession,
  deleteSession,
  generateExamSchedule,
  generateTaskBreakdown,
  getDailyCalendar,
  getHourlyCalendar,
  getMonthlyCalendar,
  getWeeklyCalendar,
  listSessions,
  updateSession,
} from '../services/plannerService';

const router = Router();

router.post('/schedule/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await generateExamSchedule(req.user!.id, {
      examDate: req.body.examDate,
      hoursPerDay: Number(req.body.hoursPerDay) || 3,
      weakSubjects: Array.isArray(req.body.weakSubjects) ? req.body.weakSubjects : [],
      allSubjects: Array.isArray(req.body.allSubjects) ? req.body.allSubjects : undefined,
      stream: req.user?.stream,
      persist: req.body.persist !== false,
    });

    res.json({
      success: true,
      summary: result.summary,
      usedFallback: result.usedFallback,
      parentTask: result.parentTask,
      subtasks: result.subtasks,
      sessions: result.sessions,
    });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to generate schedule';
    res.status(400).json({ error: message });
  }
});

router.post('/schedule/breakdown', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await generateTaskBreakdown(req.user!.id, {
      title: req.body.title,
      description: req.body.description,
      subject: req.body.subject,
      startDate: req.body.startDate,
      deadline: req.body.deadline,
      estimatedHours: req.body.estimatedHours,
      hoursPerDay: req.body.hoursPerDay,
      sessionMinutes: req.body.sessionMinutes,
      persist: req.body.persist !== false,
    });

    res.json({
      success: true,
      summary: result.summary,
      usedFallback: result.usedFallback,
      parentTask: result.parentTask,
      subtasks: result.subtasks,
      sessions: result.sessions,
    });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to break down task';
    res.status(400).json({ error: message });
  }
});

router.get('/schedule/day', authMiddleware, async (req: Request, res: Response) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const data = await getDailyCalendar(req.user!.id, date);
    res.json(data);
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to load daily calendar';
    res.status(400).json({ error: message });
  }
});

router.get('/schedule/hourly', authMiddleware, async (req: Request, res: Response) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const data = await getHourlyCalendar(req.user!.id, date);
    res.json(data);
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to load hourly calendar';
    res.status(400).json({ error: message });
  }
});

router.get('/schedule/week', authMiddleware, async (req: Request, res: Response) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const data = await getWeeklyCalendar(req.user!.id, date);
    res.json(data);
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to load weekly calendar';
    res.status(400).json({ error: message });
  }
});

router.get('/schedule/month', authMiddleware, async (req: Request, res: Response) => {
  try {
    const year = typeof req.query.year === 'string' ? Number(req.query.year) : undefined;
    const month = typeof req.query.month === 'string' ? Number(req.query.month) : undefined;
    const data = await getMonthlyCalendar(req.user!.id, year, month);
    res.json(data);
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to load monthly calendar';
    res.status(400).json({ error: message });
  }
});

router.get('/schedule/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const sessions = await listSessions(req.user!.id, from, to);
    res.json({ sessions });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to fetch sessions';
    res.status(400).json({ error: message });
  }
});

router.post('/schedule/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await createSession(req.user!.id, {
      taskId: req.body.taskId,
      title: req.body.title,
      subject: req.body.subject,
      date: req.body.date,
      startTime: req.body.startTime,
      durationMinutes: req.body.durationMinutes,
      status: req.body.status,
      notes: req.body.notes,
      aiGenerated: req.body.aiGenerated,
    });
    res.status(201).json({ session });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to create session';
    res.status(400).json({ error: message });
  }
});

router.patch('/schedule/sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!sessionId) return res.status(400).json({ error: 'Session id is required' });

    const session = await updateSession(req.user!.id, sessionId, {
      title: req.body.title,
      subject: req.body.subject,
      date: req.body.date,
      startTime: req.body.startTime,
      durationMinutes: req.body.durationMinutes,
      status: req.body.status,
      notes: req.body.notes,
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to update session';
    res.status(400).json({ error: message });
  }
});

router.delete('/schedule/sessions/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!sessionId) return res.status(400).json({ error: 'Session id is required' });

    const ok = await deleteSession(req.user!.id, sessionId);
    if (!ok) return res.status(404).json({ error: 'Session not found' });
    res.json({ success: true, deletedId: sessionId });
  } catch {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
