# AI Study Planner

This repo now includes:
- `app/`: Next.js frontend
- `backend/`: Express + TypeScript backend (auth, DB schema/init, upload, route integration stubs)

## Quick Setup (No Docker)

1. Copy env files:
   - `Copy-Item .env.example .env`
   - `Copy-Item .env.local.example .env.local`
   - `Copy-Item backend/.env.example backend/.env`

2. Put your hosted Postgres URL in both `.env` and `backend/.env`:
   - `DATABASE_URL=postgresql://...?...sslmode=require`
   - Ensure `pgvector` extension is available in that database.

3. Install dependencies:
   - `npm install`
   - `npm --prefix backend install`

4. Apply schema:
   - `npm run db:init`

5. Run apps:
   - Frontend: `npm run dev:frontend`
   - Backend: `npm run dev:backend`

## Backend Endpoints

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/upload`
- `POST /api/chat` (placeholder; replace with Person 1 route)
- `POST /api/generate-mcq` (placeholder; replace with Person 1 route)
- `GET /api/tasks` (placeholder; replace with Person 2 route)
- `POST /api/tasks` (placeholder; replace with Person 2 route)
- `POST /api/schedule/generate` (placeholder; replace with Person 2 route)

## API Smoke Test

Run:
- `powershell -ExecutionPolicy Bypass -File backend/test-api.ps1`
