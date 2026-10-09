# CareMesh — Vercel Deployment

## 1. Local preflight

```powershell
npm install
npm run typecheck
npm run build
```

## 2. Push to GitHub

```powershell
git init
git add -A
git commit -m "release: CareMesh production"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/caremesh.git
git push -u origin main
```

Do not commit `.env.local`. It is already ignored.

## 3. Import into Vercel

Vercel Dashboard → Add New Project → Import your GitHub repository.

Use:
- Framework: Next.js (auto-detected)
- Root Directory: `./`
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: leave default

## 4. Add Production environment variables

Vercel Project → Settings → Environment Variables.

Add these for Production (and Preview too if desired):

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite
NEXT_PUBLIC_APP_URL=https://YOUR_PROJECT.vercel.app
DOCUMENT_MAX_MB=10
AI_MAX_EVENTS=80
```

`SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` must never be prefixed with `NEXT_PUBLIC_`.

## 5. Deploy

Click Deploy. If variables were added after an earlier deployment, trigger a new deployment; Vercel environment-variable changes are applied on deployment.

## 6. Configure Supabase Auth

Supabase Dashboard → Authentication → URL Configuration.

Set Site URL to the production URL:

```text
https://YOUR_PROJECT.vercel.app
```

Add redirect URLs as needed, including:

```text
https://YOUR_PROJECT.vercel.app/**
http://localhost:3000/**
```

For Vercel preview deployments, add the appropriate Vercel preview pattern if you use email confirmation/reset flows in previews.

## 7. Test production

- `/login`
- `/register/patient`
- `/forgot-password`
- `/admin`
- `/admin/patients`
- `/patient`
- `/patient/assistant`
- PDF history download
- private document download
- Gemini assistant
- PWA install in Chrome

## 8. Important PDF fix

This release uses `pdf-lib`, not PDFKit, to avoid serverless/Turbopack font-file issues.
