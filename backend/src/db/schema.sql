-- ==========================================
-- AI Study Planner - Full Database Schema
-- ==========================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- NOTE: If pgvector is not available, the app falls back to in-memory vector search.
-- To enable pgvector: CREATE EXTENSION IF NOT EXISTS "vector";
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension not available — will use in-memory vector store';
END
$$;

-- ==========================================
-- USERS
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  stream VARCHAR(20) NOT NULL CHECK (stream IN ('SEE', 'PLUS2_SCIENCE', 'PLUS2_MANAGEMENT')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- SOURCES (uploaded PDFs)
-- ==========================================
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  content TEXT,
  total_pages INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);

-- ==========================================
-- CHUNKS (text chunks with embeddings)
-- ==========================================
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  page_number INT NOT NULL,
  chunk_index INT NOT NULL,
  embedding VECTOR(768)
);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);

-- ==========================================
-- TASKS
-- ==========================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100),
  deadline DATE,
  status VARCHAR(20) DEFAULT 'TODO' CHECK (status IN ('TODO', 'DOING', 'PROCRASTINATED', 'DONE')),
  priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  ai_generated BOOLEAN DEFAULT FALSE,
  position INT DEFAULT 0,
  estimated_minutes INT,
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_deadline ON tasks(user_id, deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_user_parent ON tasks(user_id, parent_task_id);

-- ==========================================
-- PLANNER SESSIONS (hourly/day/week/month blocks)
-- ==========================================
CREATE TABLE IF NOT EXISTS planner_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(100),
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'SKIPPED')),
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planner_sessions_user_start ON planner_sessions(user_id, start_at);

-- ==========================================
-- CHAT HISTORY
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);

-- ==========================================
-- GENERATED CONTENT (MCQs, Flashcards, Mindmaps)
-- ==========================================
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('mcq', 'flashcard', 'mindmap')),
  content JSONB NOT NULL,
  topic VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_generated_user ON generated_content(user_id, type);
