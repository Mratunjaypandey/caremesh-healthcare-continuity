# CareMesh — Production Setup

## 1. Prerequisites

- Node.js 22 LTS or a current supported Node.js release
- A Supabase project
- A Google Gemini API key
- A domain / HTTPS deployment for public PWA installation

## 2. Environment

Copy:

```text
.env.example → .env.local
```

Fill:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite

NEXT_PUBLIC_APP_URL=http://localhost:3000
DOCUMENT_MAX_MB=10
AI_MAX_EVENTS=80
```

Never prefix the service-role or Gemini secret with `NEXT_PUBLIC_`.

## 3. Supabase schema

Open:

```text
Supabase Dashboard → SQL Editor
```

Run:

```text
supabase/migrations/001_caremesh.sql
```

The migration creates:

```text
organizations
profiles
organization_memberships
patients
care_events
documents
appointments
notifications
care_gaps
audit_log
reports
```

It also enables RLS and creates the private `caremesh-documents` storage bucket.

## 4. Add departments and clinicians (existing database)

The premium team-management screen adds real, organization-scoped department and clinician directories. On your **existing working Supabase project**, run this additive patch once:

```text
supabase/patches/004_departments_and_clinicians.sql
```

Run it in **Supabase Dashboard → SQL Editor**. It creates only `departments` and `clinicians`, enables RLS, and adds the authorization policies required by the CareMesh administrator. It does not drop or rewrite patients, appointments, care events, documents or reports.

Then open `/admin/team` as an organization administrator to create departments, add/edit clinician directory entries, deactivate entries, and send a real Supabase invitation to clinicians with an email address. Invited clinicians receive a real `CLINICIAN` membership; deactivating a linked clinician suspends that membership.

Appointments now use active departments and clinician entries when they exist. If no directory has been configured yet, the forms allow manual text entry until setup is complete.

## 5. Provision the real organization administrator

From the project root:

```powershell
npm run bootstrap:admin -- --email admin@yourhospital.com --password "UseARealStrongPassword" --name "Your Name" --org-name "Your Hospital" --org-slug your-hospital
```

The bootstrap command creates a real Supabase Auth user, profile, organization and organization membership.

If your database was previously initialized and you have already repaired service-role privileges, do not rerun the original schema migration unnecessarily.

## 6. Run locally

```powershell
npm install
npm run typecheck
npm run dev
```

Open:

```text
http://localhost:3000
```

## 7. Gemini setup

Create the API key in Google AI Studio / Gemini API settings.

Put it in `.env.local`:

```env
GEMINI_API_KEY=YOUR_KEY
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite
```

The app calls Gemini server-side through:

```text
POST https://generativelanguage.googleapis.com/v1beta/interactions
```

with the `x-goog-api-key` header.

The application uses structured JSON output for the history summary and assistant responses. Source event IDs are validated before an AI history report is stored.

## 8. Test the patient AI assistant

After a real patient account is linked:

```text
Patient login
→ Care overview
→ Ask CareMesh AI
```

Try:

```text
What is my next appointment?
Summarize my recent care activity.
Which documents are available?
What unresolved continuity items should I review?
```

The assistant only receives the authenticated patient's own structured context.

## 9. Install CareMesh as a Chrome app

When Chrome shows the install icon or the CareMesh `Install app` action is available:

```text
Open CareMesh in Chrome
→ Install app
```

On mobile, the same PWA can be installed from Chrome's browser menu when the site is installable.

Production deployment must use HTTPS for normal web-app installation.

## 10. Recommended production settings

- Enable a real SMTP provider in Supabase Auth for email confirmations and password recovery.
- Keep the Supabase service-role secret server-only.
- Keep the Gemini key server-only.
- Enable monitoring and structured application logs.
- Set database backups and retention appropriate to your deployment.
- Add malware scanning for medical document uploads before clinical use.
- Add rate limits to authentication, uploads and AI endpoints.
- Keep patient/organization isolation enforced by PostgreSQL RLS.
- Review privacy, regulatory, retention and vendor requirements before sending healthcare information to any external AI provider.

## 11. Production build

```powershell
npm run typecheck
npm run build
npm start
```

For Vercel, add the same environment variables in Project Settings → Environment Variables.

### Gemini availability / resilience

The AI layer uses a stable Gemini Flash model by default and automatically retries transient 429/5xx failures with exponential backoff. If the primary model is temporarily overloaded (HTTP 503), the server automatically tries the configured fallback models. Configure these in `.env.local`:

```env
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite
```

This prevents the patient assistant from being tied to a single temporarily overloaded model.

## Gemini configuration for the final release

Use:

```env
GEMINI_API_KEY=YOUR_REAL_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite
```

Keep the Gemini key server-side. Never prefix it with `NEXT_PUBLIC_`.

The final release uses Google's standard `generateContent` endpoint. Temporary 429/5xx model-capacity failures are retried with exponential backoff and then moved across the configured fallback model list. If all configured models are temporarily unavailable, the patient assistant still provides a direct record-based response for supported navigation questions rather than displaying a blank chat.

For a real production deployment, configure your own Google AI billing/quotas and monitoring so capacity and rate limits match expected usage.

## PWA installation

Run the production build and deploy behind HTTPS. In Chrome on a supported device, open the deployed CareMesh site and use the browser's Install option. On mobile, Chrome can expose the install action from the browser menu or address-bar UI depending on device/version.

## Premium workflow patch

The premium release adds patient appointment booking/rescheduling and synchronized appointment timeline events. On an existing CareMesh Supabase project, run:

```text
supabase/patches/003_patient_booking_and_admin_corrections.sql
```

Do not run the reset script or the initial schema migration again on a live database.

For the department/clinician directory, additionally run `supabase/patches/004_departments_and_clinicians.sql` once. It is additive and safe for the existing data.
