# 🚀 Frontend-Backend Integration Guide

## Overview
This project consists of:
- **Frontend**: Next.js 16.1.6 application with TypeScript and Tailwind CSS
- **Backend**: Express + TypeScript API server with AI capabilities (OpenAI/Gemini), PostgreSQL database with pgvector

---

## 📁 Project Structure

```
d:\School\Hackathon\
├── frontend/              # Next.js application (Port 3000)
│   ├── app/              # Next.js App Router pages
│   │   ├── chat/         # Chat interface
│   │   ├── dashboard/    # User dashboard
│   │   ├── planner/      # Study planner
│   │   └── login/        # Login page
│   ├── lib/              # Utilities
│   │   └── api.ts        # Backend API client
│   └── .env.local        # Frontend environment variables
│
└── backend/              # Express API server (Port 3001)
    ├── src/
    │   ├── routes/       # API endpoints
    │   │   ├── auth.ts   # Authentication
    │   │   ├── chat.ts   # RAG chat
    │   │   ├── flashcard.ts
    │   │   ├── mcq.ts
    │   │   ├── mindmap.ts
    │   │   └── upload.ts # PDF upload
    │   ├── services/     # Business logic
    │   ├── middleware/   # Auth & upload middleware
    │   └── db/          # Database connection & schema
    ├── uploads/         # Uploaded PDF files
    └── .env             # Backend environment variables
```

---

## ⚙️ Configuration Files

### Frontend `.env.local` (d:\School\Hackathon\frontend\.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend `.env` (d:\School\Hackathon\backend\.env)
```env
# AI Provider
AI_PROVIDER=gemini
GEMINI_API_KEY=AIzaSy-xxxxxxxxxxxxxxxxxxxxxxxx
# Or use OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/studyplanner

# Auth
JWT_SECRET=nepal-study-planner-2026-hackathon-secret

# Server
PORT=3001
FRONTEND_URL=http://localhost:3000
```

---

## 🗄️ Database Setup

### 1. Install PostgreSQL
Download and install PostgreSQL with pgvector extension.

### 2. Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE studyplanner;

# Exit psql
\q
```

### 3. Run Schema
```bash
cd d:\School\Hackathon\backend
npm run db:setup
```

Or manually:
```bash
psql -U postgres -d studyplanner -f src/db/schema.sql
```

---

## 🔧 Installation

### Backend
```bash
cd d:\School\Hackathon\backend
npm install
```

### Frontend
```bash
cd d:\School\Hackathon\frontend
npm install
```

---

## 🚀 Running the Application

### Option 1: Run Both Servers Separately

#### Terminal 1 - Backend
```bash
cd d:\School\Hackathon\backend
npm run dev
```
✅ Backend running at: http://localhost:3001

#### Terminal 2 - Frontend
```bash
cd d:\School\Hackathon\frontend
npm run dev
```
✅ Frontend running at: http://localhost:3000

---

## 📡 API Integration

The frontend uses the API client at `frontend/lib/api.ts` to communicate with the backend.

### Example: Login
```typescript
import { login } from '@/lib/api';

const response = await login({
  email: 'user@example.com',
  password: 'password123'
});

if (response.data) {
  console.log('Logged in:', response.data.user);
  // Token is automatically stored in localStorage
}
```

### Example: Upload PDF
```typescript
import { uploadPDF } from '@/lib/api';

const file = /* File object from input */;
const response = await uploadPDF(file);

if (response.data) {
  console.log('Upload successful:', response.data);
}
```

### Example: Generate MCQs
```typescript
import { generateMCQ } from '@/lib/api';

const response = await generateMCQ({
  sourceId: 'uuid-here',
  count: 10,
  difficulty: 'medium'
});
```

---

## 🔐 Authentication Flow

1. User signs up or logs in via `/api/auth/signup` or `/api/auth/login`
2. Backend returns JWT token
3. Token is stored in `localStorage` (key: `authToken`)
4. All subsequent API calls include: `Authorization: Bearer <token>`
5. Logout: Call `logout()` from `lib/api.ts`

---

## 📋 Available API Endpoints

### Auth
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Upload & Sources
- `POST /api/upload` - Upload PDF (multipart/form-data)
- `GET /api/sources` - List user's uploaded sources
- `DELETE /api/sources/:id` - Delete source

### Chat (RAG)
- `POST /api/chat` - Ask question with RAG
- `GET /api/chat/history` - Get chat history

### MCQ
- `POST /api/generate-mcq` - Generate MCQs from source
- `GET /api/mcqs` - Get all MCQs
- `GET /api/mcqs?sourceId=xxx` - Get MCQs by source

### Flashcards
- `POST /api/generate-flashcards` - Generate flashcards
- `GET /api/flashcards` - Get all flashcards
- `GET /api/flashcards?sourceId=xxx` - Get flashcards by source

### Mindmap
- `POST /api/generate-mindmap` - Generate mindmap
- `GET /api/mindmaps` - Get all mindmaps
- `GET /api/mindmaps?sourceId=xxx` - Get mindmaps by source

### Health
- `GET /api/health` - Check backend status

---

## 🎨 Frontend Pages

- `/` - Landing page
- `/login` - Authentication
- `/dashboard` - User dashboard
- `/chat` - RAG chat interface
- `/planner` - Study planner (Kanban board)

---

## 🧪 Testing the Integration

### 1. Check Backend Health
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "AI Study Planner Backend",
  "aiProvider": "gemini",
  "database": "connected",
  "pgvector": true,
  "timestamp": "2026-02-13T..."
}
```

### 2. Test from Frontend
Open browser console at http://localhost:3000 and run:
```javascript
fetch('http://localhost:3001/api/health')
  .then(r => r.json())
  .then(console.log);
```

---

## 🐛 Troubleshooting

### CORS Errors
- Ensure backend `.env` has `FRONTEND_URL=http://localhost:3000`
- Check that backend is running on port 3001
- Verify frontend runs on port 3000

### Database Connection Errors
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in backend `.env`
- Verify database `studyplanner` exists
- Run schema: `npm run db:setup`

### AI Provider Errors
- Set valid `GEMINI_API_KEY` or `OPENAI_API_KEY` in backend `.env`
- Ensure `AI_PROVIDER` matches the key you've set

### Auth Token Not Persisting
- Check browser localStorage for `authToken`
- Ensure cookies/localStorage are enabled
- Try clearing localStorage and logging in again

---

## 📦 Dependencies

### Backend
- express - Web framework
- cors - Cross-origin resource sharing
- pg - PostgreSQL client
- @google/generative-ai - Gemini AI
- openai - OpenAI API
- pdf-parse - PDF text extraction
- bcryptjs - Password hashing
- jsonwebtoken - JWT auth
- multer - File upload

### Frontend
- next - React framework
- react - UI library
- tailwindcss - Styling

---

## 🔒 Security Notes

⚠️ **Important for Production:**
1. Change `JWT_SECRET` to a strong random value
2. Never commit `.env` files
3. Use environment variables for API keys
4. Enable HTTPS in production
5. Set proper CORS origins (not `*`)
6. Add rate limiting
7. Validate all user inputs
8. Use prepared statements (already done via pg)

---

## 🎯 Next Steps

1. **Enhance Frontend Pages**: Add actual API integrations to dashboard, chat, and planner pages
2. **Add Error Handling**: Display user-friendly error messages
3. **Add Loading States**: Show spinners during API calls
4. **Add File Upload UI**: Create drag-and-drop PDF upload interface
5. **Add MCQ/Flashcard UI**: Display generated study materials
6. **Add User Profile**: Edit profile, change password
7. **Deploy**: Set up production environment

---

## 📄 License

This project is for hackathon purposes.

---

## 👥 Support

For issues or questions:
1. Check the troubleshooting section
2. Review backend logs: `cd backend && npm run dev`
3. Review frontend logs: `cd frontend && npm run dev`
4. Check browser console for frontend errors
