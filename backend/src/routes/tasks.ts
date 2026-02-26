import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createTask,
  deleteTask,
  getTaskStats,
  listTasks,
  reorderTask,
  TaskStatus,
  updateTask,
} from '../services/plannerService';

const router = Router();

router.get('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tasks = await listTasks(req.user!.id, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      subject: typeof req.query.subject === 'string' ? req.query.subject : undefined,
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      parentTaskId: typeof req.query.parentTaskId === 'string' ? req.query.parentTaskId : undefined,
    });
    res.json({ tasks });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to fetch tasks';
    res.status(500).json({ error: message });
  }
});

router.post('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const task = await createTask(req.user!.id, {
      title: req.body.title,
      description: req.body.description,
      subject: req.body.subject,
      deadline: req.body.deadline,
      status: req.body.status,
      priority: req.body.priority,
      estimatedMinutes: req.body.estimatedMinutes,
      parentTaskId: req.body.parentTaskId,
      aiGenerated: req.body.aiGenerated,
    });
    res.status(201).json({ task });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to create task';
    res.status(400).json({ error: message });
  }
});

async function handleTaskUpdate(req: Request, res: Response) {
  try {
    const taskId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!taskId) return res.status(400).json({ error: 'Task id is required' });

    const task = await updateTask(req.user!.id, taskId, {
      title: req.body.title,
      description: req.body.description,
      subject: req.body.subject,
      deadline: req.body.deadline,
      status: req.body.status,
      priority: req.body.priority,
      estimatedMinutes: req.body.estimatedMinutes,
      parentTaskId: req.body.parentTaskId,
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found or no fields provided' });
    }
    res.json({ task });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to update task';
    res.status(400).json({ error: message });
  }
}

router.patch('/tasks/:id', authMiddleware, handleTaskUpdate);
router.put('/tasks/:id', authMiddleware, handleTaskUpdate);

router.delete('/tasks/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const taskId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
    if (!taskId) return res.status(400).json({ error: 'Task id is required' });

    const ok = await deleteTask(req.user!.id, taskId);
    if (!ok) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, deletedId: taskId });
  } catch {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

router.put('/tasks/reorder', authMiddleware, async (req: Request, res: Response) => {
  try {
    const taskId = typeof req.body.taskId === 'string' ? req.body.taskId : '';
    const status = req.body.newStatus as TaskStatus;
    const position = Number(req.body.newPosition);

    if (!taskId || !status || Number.isNaN(position)) {
      return res.status(400).json({ error: 'taskId, newStatus, and newPosition are required' });
    }

    await reorderTask(req.user!.id, taskId, status, position);
    res.json({ success: true });
  } catch (error) {
    const message = (error as { message?: string }).message || 'Failed to reorder tasks';
    res.status(400).json({ error: message });
  }
});

router.get('/tasks/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await getTaskStats(req.user!.id);
    res.json(stats);
  } catch {
    res.status(500).json({ error: 'Failed to fetch task stats' });
  }
});

export default router;
