// backend/src/services/scheduleService.js
import OpenAI from 'openai';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function generateStudySchedule({ userId, examDate, weakSubjects, hoursPerDay, allSubjects, stream }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const examDateObj = new Date(examDate);
  const daysUntilExam = Math.ceil((examDateObj - today) / (1000 * 60 * 60 * 24));

  // ✅ Fixed: explicit JSON-only prompt with clear structure
  const prompt = `You are an expert study planner for Nepali ${stream === 'SEE' ? 'SEE' : '+2'} students.

Create a 7-day study schedule:
- Today: ${todayStr}
- Exam date: ${examDate} (${daysUntilExam} days away)
- Student stream: ${stream}
- Weak subjects (need 60% of time): ${weakSubjects.join(', ')}
- All subjects: ${allSubjects.join(', ')}
- Study hours available per day: ${hoursPerDay}

RULES:
1. Generate 15-20 tasks spread across 7 days (2-3 tasks per day).
2. Each task is 30-90 minutes. Be specific: "Solve 10 problems from Ch.3 Kinematics" NOT "Study Physics".
3. Weak subjects get priority HIGH, others MEDIUM, review tasks LOW.
4. Mix subjects each day.
5. Set deadlines starting from ${todayStr} going forward 7 days.

You MUST respond with ONLY a raw JSON object. No explanation, no markdown, no backticks.
The format is exactly:
{
  "summary": "Brief 1-2 sentence overview of the plan",
  "plan": [
    {
      "title": "Solve 10 kinematics problems from Chapter 3",
      "subject": "Physics",
      "description": "Focus on projectile motion and free fall. Use textbook page 45-52.",
      "deadline": "2026-02-13",
      "priority": "HIGH",
      "estimatedMinutes": 60
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 3000,
  });

  const raw = response.choices[0].message.content || '{}';

  // ✅ Strip markdown code fences if AI adds them anyway
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let plan = [];
  let summary = 'Study plan generated.';

  try {
    const parsed = JSON.parse(cleaned);
    plan = parsed.plan || [];
    summary = parsed.summary || summary;
  } catch (err) {
    console.error('Failed to parse AI response:', err);
    console.error('Raw AI output was:', raw);
    // Return empty plan rather than crashing
  }

  return { plan, summary };
}

export async function insertScheduleIntoTasks(userId, plan) {
  let insertedCount = 0;

  for (let i = 0; i < plan.length; i++) {
    const task = plan[i];
    try {
      await pool.query(
        `INSERT INTO tasks (user_id, title, description, subject, deadline, priority, status, ai_generated, position)
         VALUES ($1, $2, $3, $4, $5, $6, 'TODO', TRUE, $7)`,
        [
          userId,
          task.title || 'Study Task',
          task.description || '',
          task.subject || 'General',
          task.deadline || null,
          task.priority || 'MEDIUM',
          i,
        ]
      );
      insertedCount++;
    } catch (err) {
      console.error(`Failed to insert task ${i}:`, err.message);
    }
  }

  return { insertedCount };
}