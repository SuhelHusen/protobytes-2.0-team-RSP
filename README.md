# Study Flow: AI Study Planner for SEE & +2 

# Team Name : R.S.P
 ## Team Members:
 1. Raag Yatchu Maharjan - [maharjanraag@gmail.com] - [Raag-ops]
 2. Samyog G.C. - [gcsamyog77@gmail.com] - [Hawkeyyyy]
 3. Suhel Husen - [huzayn98570@gmail.com] - [Suhel Husen]
 4. Suman Shrestha - [158shresthasuman@gmail.com] - [1Suman]

> **Hackathon Project**
> A smart AI-powered study companion for Nepali students preparing for SEE and +2 exams.

**Already set up?** Run these in separate terminals:
```bash
# Terminal 1: Backend (Port 3001)
cd backend && npm run dev

# Terminal 2: Frontend (Port 3000)
cd frontend && npm run dev
```

---

## Product Vision

Students upload their textbook PDFs, ask questions grounded in their own materials, generate MCQs/flashcards, and get AI-powered revision schedules — all in one clean platform.

### Core Demo Flow

1. Student selects: **SEE** or **+2** (Science/Management)
2. Uploads a textbook PDF
3. Asks: *"Explain Newton's First Law"*
4. AI answers **ONLY from uploaded source** with citation → `Physics_Grade11.pdf (Page 23)`
5. Clicks **"Generate 10 MCQs from Chapter 3"**
6. Opens **Planner** → AI auto-generates 7-day revision schedule
7. **Kanban board** updates as tasks are completed

---

## Architecture

```
Frontend (Next.js + Tailwind)
        |
  Backend API (Node.js / Express)
        |
  Database (PostgreSQL + pgvector)
        |
    Vector Search (pgvector / in-memory)
        |
      AI API (OpenAI / Gemini)
```
---

## 👥 Team Roles

| Person | Role | Key Deliverables |
|--------|------|-----------------|
| **Person 1** | AI + RAG Engine | PDF ingestion, vector search, chat API, MCQ generation |
| **Person 2** | Planner System | Kanban board, calendar, AI schedule generator |
| **Person 3** | Frontend + UI/UX | Dashboard, chat UI, planner UI, responsive design |
| **Person 4** | Integration + Backend + Auth | Auth, DB setup, file storage, deployment |

> Each person has a dedicated guide: see the `docs/` folder.


## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js |
| Database | PostgreSQL + pgvector extension |
| AI | OpenAI API (GPT-4) or Google Gemini API |
| PDF Parsing | `pdf-parse` or `pdfjs-dist` |
| Embeddings | OpenAI `text-embedding-ada-002` or similar |
| Auth | JWT + bcrypt |
| File Storage | Local filesystem (hackathon) or Supabase Storage |
| Deployment | Vercel (frontend) + Railway/Render (backend + DB) |

---

## 📂 Project Structure

```
ai-study-planner/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── dashboard/
│   │   ├── chat/
│   │   ├── planner/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                # shadcn components
│   │   ├── ChatPanel.tsx
│   │   ├── SourcePanel.tsx
│   │   ├── KanbanBoard.tsx
│   │   ├── CalendarView.tsx
│   │   ├── MCQCard.tsx
│   │   └── FlashCard.tsx
│   └── lib/
│       ├── api.ts             # API client
│       └── auth.ts            # Auth helpers
│
├── backend/                   # Express API
│   ├── src/
│   │   ├── index.ts           # Server entry
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── upload.ts
│   │   │   ├── chat.ts
│   │   │   ├── tasks.ts
│   │   │   ├── mcq.ts
│   │   │   └── schedule.ts
│   │   ├── services/
│   │   │   ├── pdfService.ts
│   │   │   ├── embeddingService.ts
│   │   │   ├── ragService.ts
│   │   │   ├── mcqService.ts
│   │   │   └── scheduleService.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   └── db/
│   │       ├── schema.sql
│   │       └── connection.ts
│   └── uploads/               # PDF storage
│
├── docs/                      # Team guides
│   ├── PERSON1_AI_RAG.md
│   ├── PERSON2_PLANNER.md
│   ├── PERSON3_FRONTEND.md
│   └── PERSON4_INTEGRATION.md
│
├── .env.example
├── package.json
└── README.md
```


## Quick Start

```bash
# 1. Clone repo
git clone <repo-url>
cd ai-study-planner

# 2. Backend setup
cd backend
npm install
cp .env.example .env   # Fill in API keys
npm run dev

# 3. Frontend setup (new terminal)
cd frontend
npm install
npm run dev

# 4. Database
# Make sure PostgreSQL is running
# Run: psql -f backend/src/db/schema.sql
```
