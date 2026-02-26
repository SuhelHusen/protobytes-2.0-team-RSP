# 🎓 AI Study Planner - Quick Start

## Prerequisites Checklist
- [ ] Node.js 20+ installed
- [ ] PostgreSQL installed and running
- [ ] Git installed

## 🚀 Quick Start (5 minutes)

### 1. Setup Backend
```bash
# Navigate to backend
cd d:\School\Hackathon\backend

# Install dependencies (already done)
npm install

# Configure environment
# Edit .env and add your API key:
# - Get Gemini API key: https://makersuite.google.com/app/apikey
# - Or OpenAI key: https://platform.openai.com/api-keys

# Create database
psql -U postgres -c "CREATE DATABASE studyplanner;"

# Run schema
npm run db:setup

# Start backend server
npm run dev
```
✅ Backend runs at: **http://localhost:3001**

### 2. Setup Frontend
Open a new terminal:
```bash
# Navigate to frontend
cd d:\School\Hackathon\frontend

# Install dependencies (already done)
npm install

# Start development server
npm run dev
```
✅ Frontend runs at: **http://localhost:3000**

### 3. Test the Integration
1. Open browser: **http://localhost:3000**
2. Open browser console (F12)
3. Run:
   ```javascript
   fetch('http://localhost:3001/api/health')
     .then(r => r.json())
     .then(console.log)
   ```
4. Should see: `{status: "ok", service: "AI Study Planner Backend", ...}`

## 🎯 What's Next?

### Basic Flow
1. **Sign Up**: Navigate to `/login` (or implement signup page)
2. **Upload PDF**: Upload study material via `/upload`
3. **Chat**: Ask questions about your materials
4. **Generate MCQs**: Create practice questions
5. **Flashcards**: Generate study flashcards
6. **Mindmap**: Visualize study topics

### Using the API in Your Frontend

The API client is located at `frontend/lib/api.ts`. Here's a quick example:

```typescript
'use client';

import { useState } from 'react';
import { login, uploadPDF, generateMCQ } from '@/lib/api';

export default function Example() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const response = await login({
      email: 'test@example.com',
      password: 'password123'
    });
    
    if (response.data) {
      console.log('Logged in!', response.data.user);
    } else {
      console.error('Login failed:', response.error);
    }
    setLoading(false);
  };

  return (
    <button onClick={handleLogin} disabled={loading}>
      {loading ? 'Logging in...' : 'Login'}
    </button>
  );
}
```

## 📚 Documentation

- Full integration guide: [INTEGRATION.md](./INTEGRATION.md)
- Backend README: [backend/README.md](./backend/README.md)
- Frontend README: [frontend/README.md](./frontend/README.md)

## 🐛 Common Issues

**Backend won't start?**
- Check PostgreSQL is running: `psql -U postgres -l`
- Verify `.env` has correct `DATABASE_URL`
- Check port 3001 is not in use

**Frontend API calls fail?**
- Ensure backend is running on port 3001
- Check CORS settings in `backend/src/index.ts`
- Verify `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3001`

**Database errors?**
- Run: `npm run db:setup` in backend folder
- Check PostgreSQL credentials in `.env`

## 🎨 Tech Stack

**Frontend:**
- Next.js 16.1.6 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4

**Backend:**
- Express.js
- TypeScript
- PostgreSQL + pgvector
- Google Gemini AI / OpenAI
- JWT Authentication

## 📞 Need Help?

1. Check [INTEGRATION.md](./INTEGRATION.md) for detailed setup
2. Review terminal logs for errors
3. Check browser console for frontend errors
4. Verify all environment variables are set

---

**Ready to build!** 🚀
