# CareMesh Final Premium UI / Workflow Update

This release is designed to sit on top of the existing working CareMesh Supabase project.

## New UX

- Premium mobile-first login with glass/aurora styling.
- Compact AI assistant drawer instead of full-screen takeover.
- Dedicated patient notification bell with unread count.
- Notifications removed from the patient home dashboard.
- Mobile menu is a real toggle: tap once to open, tap again to close.
- Desktop collapsible navigation rail retained and visually refreshed.
- Premium upload dropzone with drag-and-drop, file preview and clear state.
- Cleaner document library with search, filters and secure download actions.
- Appointment booking for patients.
- Patient appointment reschedule/cancel controls.
- Admin appointment editing/rescheduling controls.
- Admin patient master-profile correction controls.
- Admin care-event correction controls with audit entries.
- PDF report first-page blank-page bug fixed.
- PDF cover/report styling improved.
- Visible Gemini branding removed from user-facing summary labels.

## Existing database

Do NOT reset or rerun the initial CareMesh schema migration.

Run this one additional SQL patch against the existing Supabase project:

`supabase/patches/003_patient_booking_and_admin_corrections.sql`

It adds the RLS permissions needed for authenticated patients to create and modify only their own appointments.

## Local verification

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

## Production deployment

After local verification, commit and push the project to the connected GitHub repository. Vercel will create a new deployment automatically.

Keep the existing `.env.local` private and configure the same production variables in Vercel.


## Premium mobile-layout + care-team update

- Removed the duplicated document-vault header and nested upload panel that caused title collisions on small screens.
- Rebuilt the document upload card so its upload action remains above the mobile bottom navigation and has consistent padding.
- Forced the admin appointment form and registry into a responsive stack on tablet/phone widths; form fields collapse to one column on narrow screens.
- Corrected the collapsed desktop sidebar preference on mobile: opening the drawer always shows full-width labels and user identity instead of a narrow icon rail.
- Hides bottom navigation while the mobile drawer is open to remove competing navigation layers.
- Added `/admin/team`, restricted to organization admins, to create/edit/deactivate departments and clinician directory entries.
- Added a real clinician portal invitation endpoint with Supabase Auth + organization membership, and suspends the linked clinician membership when deactivated.
- Appointment forms use active department and clinician directories when available; existing appointment text remains editable and legacy values are preserved as selectable current values.
- Added `supabase/patches/004_departments_and_clinicians.sql`. Run this additive patch once on the existing Supabase database. Do not run reset or migration 001 again.
