// backend/src/routes/tasks.js
import { Router } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = Router();

// ---------------- GET /api/tasks/stats ----------------
// ⚠️ Route is just /stats because it's mounted at /api/tasks in server.js
router.get('/stats', async (req, res) => {
  try {
    const { userId } = req.query;

    const statusCounts = await pool.query(
      `SELECT status, COUNT(*) as count FROM tasks WHERE user_id = $1 GROUP BY status`,
      [userId]
    );

    const todayTasks = await pool.query(
      `SELECT * FROM tasks WHERE user_id = $1 AND deadline = CURRENT_DATE ORDER BY priority DESC, position ASC`,
      [userId]
    );

    const completedToday = await pool.query(
      `SELECT COUNT(*) as count FROM tasks WHERE user_id = $1 AND status = 'DONE' AND updated_at::date = CURRENT_DATE`,
      [userId]
    );

    const overdue = await pool.query(
      `SELECT COUNT(*) as count FROM tasks WHERE user_id = $1 AND status != 'DONE' AND deadline < CURRENT_DATE`,
      [userId]
    );

    const subjectBreakdown = await pool.query(
      `SELECT subject, status, COUNT(*) as count FROM tasks WHERE user_id = $1 GROUP BY subject, status ORDER BY subject`,
      [userId]
    );

    const stats = { TODO: 0, DOING: 0, DONE: 0 };
    statusCounts.rows.forEach((row) => {
      stats[row.status] = parseInt(row.count);
    });

    res.json({
      total: stats.TODO + stats.DOING + stats.DONE,
      todo: stats.TODO,
      doing: stats.DOING,
      done: stats.DONE,
      completedToday: parseInt(completedToday.rows[0]?.count || '0'),
      overdue: parseInt(overdue.rows[0]?.count || '0'),
      todayTasks: todayTasks.rows,
      subjectBreakdown: subjectBreakdown.rows,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ---------------- PUT /api/tasks/reorder ----------------
router.put('/reorder', async (req, res) => {
  try {
    const { taskId, userId, newStatus, newPosition } = req.body;

    if (!taskId || !userId || !newStatus || newPosition === undefined) {
      return res.status(400).json({ error: 'taskId, userId, newStatus, newPosition are required' });
    }

    // Update the moved task
    await pool.query(
      `UPDATE tasks SET status=$1, position=$2, updated_at=NOW() WHERE id=$3 AND user_id=$4`,
      [newStatus, newPosition, taskId, userId]
    );

    // Shift other tasks in that column down to make room
    await pool.query(
      `UPDATE tasks SET position=position+1 WHERE user_id=$1 AND status=$2 AND position >= $3 AND id != $4`,
      [userId, newStatus, newPosition, taskId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// ---------------- GET /api/tasks ----------------
router.get('/', async (req, res) => {
  try {
    const { status, subject, startDate, endDate, userId } = req.query;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    let query = `SELECT * FROM tasks WHERE user_id = $1`;
    const params = [userId];
    let index = 2;

    if (status)    { query += ` AND status = $${index++}`;   params.push(status); }
    if (subject)   { query += ` AND subject = $${index++}`;  params.push(subject); }
    if (startDate) { query += ` AND deadline >= $${index++}`; params.push(startDate); }
    if (endDate)   { query += ` AND deadline <= $${index++}`; params.push(endDate); }

    query += ` ORDER BY position ASC, created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ tasks: result.rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// ---------------- POST /api/tasks ----------------
router.post('/', async (req, res) => {
  try {
    const { userId, title, description, subject, deadline, priority = 'MEDIUM', status = 'TODO' } = req.body;

    if (!title)   return res.status(400).json({ error: 'Title is required' });
    if (!userId)  return res.status(400).json({ error: 'userId is required' });

    const posResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM tasks WHERE user_id=$1 AND status=$2`,
      [userId, status]
    );
    const position = posResult.rows[0].next_pos;

    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, subject, deadline, priority, status, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, title, description, subject, deadline, priority, status, position]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// ---------------- PUT /api/tasks/:id ----------------
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, title, description, subject, deadline, priority, status } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const updates = [];
    const params = [];
    let index = 1;

    if (title !== undefined)       { updates.push(`title=$${index++}`);       params.push(title); }
    if (description !== undefined) { updates.push(`description=$${index++}`); params.push(description); }
    if (subject !== undefined)     { updates.push(`subject=$${index++}`);     params.push(subject); }
    if (deadline !== undefined)    { updates.push(`deadline=$${index++}`);    params.push(deadline); }
    if (priority !== undefined)    { updates.push(`priority=$${index++}`);    params.push(priority); }
    if (status !== undefined)      { updates.push(`status=$${index++}`);      params.push(status); }

    updates.push(`updated_at=NOW()`);
    if (updates.length === 1) return res.status(400).json({ error: 'No fields to update' });

    params.push(id, userId);
    const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id=$${index++} AND user_id=$${index++} RETURNING *`;
    const result = await pool.query(query, params);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ---------------- DELETE /api/tasks/:id ----------------
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const result = await pool.query(
      `DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING id`,
      [id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
