# CareMesh — Final Production Web App

CareMesh is a production-oriented healthcare continuity platform built around a shared longitudinal patient record. It has separate hospital/lab and patient portals, role-based access, PostgreSQL Row-Level Security, private document storage, appointments, notifications, care gaps, audit history, AI-assisted history summaries, and a patient-facing AI assistant.

## Core stack

- Next.js 16 App Router + TypeScript
- Supabase Auth
- Supabase PostgreSQL + Row-Level Security
- Supabase Storage (private medical documents)
- Google Gemini API (server-side)
- `pdf-lib` in-memory patient-history PDF generation
- Progressive Web App (PWA) install support for Chrome
- Mobile-first responsive navigation

## AI provider

CareMesh uses Gemini through the server-side Google Gemini API. The default model is `gemini-3.7-flash` with automatic 3.6/3.5 Flash-Lite fallback, configurable with `GEMINI_MODEL`.

The AI has a strict non-diagnostic boundary: it can organize documented records, summarize the longitudinal journey, surface source-backed continuity information and answer patient navigation questions, but it must not diagnose, prescribe, or make treatment decisions.

## No demo content

This final package contains:

- no demo users
- no seeded patient records
- no hard-coded passwords
- no localStorage database
- no fake authentication

You provision your real hospital/lab organization and administrator, then use the real Supabase database.

## Project structure

```text
app/
  admin/                    Hospital / Lab portal
  patient/                  Patient portal
  api/                      Server-side APIs including Gemini
  profile/                  Shared profile/settings
  login/                    Real Supabase login
components/                 Responsive UI + PWA + AI assistant
lib/                        Supabase, auth, AI and domain logic
public/                     Manifest, PWA icons, service worker
scripts/                    Real organization/admin provisioning
supabase/                   Database migration + permission repairs
```

## Main product capabilities

### Care team portal

- Organization-scoped dashboard
- Patient search by mobile or patient ID
- New patient registration
- OPD, admission, lab, follow-up, appointment, billing and document records
- Appointment lifecycle
- Patient portal invitations
- Document review
- Department directory management
- Doctor / clinician directory management
- Clinician portal invitations and account suspension on deactivation
- Care-gap review and resolution
- Audit trail
- Gemini-assisted history report
- Secure document downloads

### Patient portal

- Own-record-only access
- Timeline
- Documents
- Appointments
- Notifications
- Patient notes
- Profile + password management
- Gemini-generated history summary
- Private CareMesh AI assistant
- Installable PWA for Chrome
- Mobile bottom navigation + responsive menu

## PWA / install as app

The project includes:

- `public/manifest.webmanifest`
- 192px and 512px icons
- `public/sw.js`
- a browser installation prompt when Chrome exposes `beforeinstallprompt`
- an install option inside the profile/menu UI

For local development, Chrome can install PWAs from `http://localhost:3000`. For a public deployment, use HTTPS. Chrome's installability checks require a valid manifest and suitable icons; CareMesh includes those assets.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill the real Supabase values.
3. Fill the real Gemini API key.
4. Run the Supabase migration in `supabase/migrations/001_caremesh.sql`.
5. Apply any setup/permission patch required by your current database state.
6. Provision the real administrator with the bootstrap command.
7. Run `npm install` and `npm run dev`.

See `SETUP.md` for the exact steps. If using an already-created Supabase project, apply the additive `supabase/patches/004_departments_and_clinicians.sql` patch to enable department and clinician management; do not reset the database.

### Gemini availability / resilience

The AI layer uses a stable Gemini Flash model by default and automatically retries transient 429/5xx failures with exponential backoff. If the primary model is temporarily overloaded (HTTP 503), the server automatically tries the configured fallback models. Configure these in `.env.local`:

```env
GEMINI_MODEL=gemini-3.7-flash
GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash-lite
```

This prevents the patient assistant from being tied to a single temporarily overloaded model.

## Final UI / reliability release

This release adds a mobile-first navigation rail + bottom navigation, a profile route wrapped in the authenticated shell, a full-height AI assistant drawer that does not clip its composer, searchable/filterable document cards, and a resilient Gemini integration.

Gemini uses the standard `generateContent` REST API with a model cascade. The default primary model is `gemini-3.6-flash`, followed by configured fallbacks. Temporary 429/5xx capacity failures use exponential backoff; when all Gemini models are temporarily unavailable, CareMesh falls back to a record-only answer for common patient navigation questions or a record-only history summary. Invalid API keys and permission errors are not silently masked.
