-- ============================================================
-- StudyOS Database Setup
-- Run: psql -U postgres -d ai_study_planner -f setup.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100),
  stream VARCHAR(30) DEFAULT 'SEE' CHECK (stream IN ('SEE', 'PLUS2_SCIENCE', 'PLUS2_MANAGEMENT')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100),
  deadline DATE,
  status VARCHAR(20) DEFAULT 'TODO' CHECK (status IN ('TODO', 'DOING', 'DONE')),
  priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  ai_generated BOOLEAN DEFAULT FALSE,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status   ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_deadline ON tasks(user_id, deadline);

-- Test user (matches hardcoded ID in backend/src/middleware/auth.js)
INSERT INTO users (id, name, stream)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Student', 'PLUS2_SCIENCE')
ON CONFLICT (id) DO NOTHING;

SELECT 'Setup complete!' as status;
