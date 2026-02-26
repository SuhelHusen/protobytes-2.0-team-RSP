// backend/src/routes/schedule.js
import { Router } from 'express';
import { generateStudySchedule, insertScheduleIntoTasks } from '../services/scheduleService.js';

const router = Router();

const SUBJECTS = {
  SEE: ['Mathematics', 'Science', 'English', 'Nepali', 'Social Studies', 'Computer Science'],
  PLUS2_SCIENCE: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'Nepali'],
  PLUS2_MANAGEMENT: ['Accountancy', 'Business Studies', 'Economics', 'Mathematics', 'English', 'Nepali'],
};

// ---------------- GET /api/schedule/subjects ----------------
router.get('/subjects', async (req, res) => {
  const { stream } = req.query;
  const subjects = SUBJECTS[stream] || SUBJECTS['SEE'];
  res.json({ subjects });
});

// ---------------- POST /api/schedule/generate ----------------
router.post('/generate', async (req, res) => {
  try {
    const { userId, examDate, weakSubjects, hoursPerDay = 4, stream } = req.body;

    if (!examDate || !weakSubjects || weakSubjects.length === 0) {
      return res.status(400).json({ error: 'examDate and weakSubjects are required' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const allSubjects = SUBJECTS[stream] || SUBJECTS['SEE'];
    const { plan, summary } = await generateStudySchedule({
      userId, examDate, weakSubjects, hoursPerDay, allSubjects, stream
    });

    const { insertedCount } = await insertScheduleIntoTasks(userId, plan);

    res.json({ success: true, summary, tasksCreated: insertedCount, plan });
  } catch (err) {
    console.error('Schedule generate error:', err);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

// ---------------- POST /api/schedule/countdown ----------------
router.post('/countdown', async (req, res) => {
  try {
    const { examDate } = req.body;

    if (!examDate) return res.status(400).json({ error: 'examDate is required' });

    const today = new Date();
    const exam = new Date(examDate);
    const diffTime = exam.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let message;
    if (diffDays <= 0)     message = "Exam day is here! Good luck! 🙏";
    else if (diffDays <= 3) message = `Only ${diffDays} days left! Focus on revision.`;
    else if (diffDays <= 7) message = `${diffDays} days to go. Stay consistent.`;
    else                    message = `${diffDays} days remaining. You've got this! 💪`;

    res.json({ examDate, daysRemaining: diffDays, isUrgent: diffDays <= 7, message });
  } catch (err) {
    console.error('Countdown error:', err);
    res.status(500).json({ error: 'Failed to calculate countdown' });
  }
});

export default router;
