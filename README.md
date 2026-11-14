# AbilityConnect SA

## 1. Database (PostgreSQL)
Create an empty database named `abilityconnect` (pgAdmin, or `createdb abilityconnect`).

## 2. Backend
```
cd backend
npm install
copy .env.example .env      (macOS/Linux: cp)   then edit DATABASE_URL and JWT_SECRET
npm run seed                (creates tables, test accounts, fictional sample data)
npm run dev                 (http://localhost:5000/api/health)
```
## 3. Frontend
```
cd frontend
npm install
copy .env.example .env
npm run dev                 (http://localhost:5173)
```
## Test accounts (fictional)
- Admin: admin@abilityconnect.test / Admin@12345
- User:  user@abilityconnect.test / User@12345

## Deploy
- Database: Supabase or Render Postgres (use its connection string as DATABASE_URL, run `npm run seed` once).
- Backend: Render web service, root `backend`, build `npm install`, start `npm start`. Env vars: DATABASE_URL, JWT_SECRET, CLIENT_URL (your frontend URL).
- Frontend: Vercel, root `frontend`, build `npm run build`, output `dist`. Env var: VITE_API_URL (your backend URL).
