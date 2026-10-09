# CareMesh — Final Architecture

```text
                        ┌──────────────────────────┐
                        │       CareMesh Web       │
                        │ Next.js App Router / PWA │
                        └────────────┬─────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
      ┌───────▼───────┐      ┌──────▼──────┐      ┌────────▼────────┐
      │ Admin portal  │      │Patient portal│      │ Profile / PWA   │
      └───────┬───────┘      └──────┬──────┘      └────────┬────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                            Supabase SSR / Auth
                                     │
                         PostgreSQL + RLS + Storage
                                     │
               ┌────────────────────┼─────────────────────┐
               │                    │                     │
         care timeline        documents            notifications
               │                    │                     │
               └────────────────────┼─────────────────────┘
                                    │
                              Server-side AI
                                    │
                             Gemini API
                                    │
              ┌─────────────────────┴──────────────────────┐
              │                                            │
       AI history summary                         Patient AI assistant
              │                                            │
        reports table                              authenticated context
```

## Security model

- Supabase Auth establishes identity and session.
- Organization membership establishes role and organization.
- PostgreSQL RLS is the data authorization boundary.
- Patients can access only their linked patient record.
- Admin/clinician access is organization-scoped.
- Medical documents stay in a private storage bucket.
- Document downloads use authorized server routes / signed access.
- Service-role and Gemini secrets never reach the browser.

## AI boundary

The Gemini layer is deliberately non-diagnostic.

It can:

- summarize documented events
- structure source-backed timeline highlights
- describe continuity/documentation gaps
- answer patient navigation questions about their own record

It cannot:

- diagnose disease
- prescribe medication
- alter clinical instructions
- make autonomous treatment decisions
- reveal another patient's data

## PWA model

The web app includes a standard manifest, icons, service-worker registration and an install prompt. Authenticated healthcare pages are not cached by the service worker, preventing sensitive HTML from being placed in the offline cache.


## Organization directory (premium update)

Two organization-scoped tables support the care team:

- `departments`: name, short code, description, active state and creator.
- `clinicians`: clinician identity, specialty, contact fields, optional department, active state, and optional linked Supabase Auth account.

Both tables use RLS. Organization members can read their own organization's directory; only organization administrators can create or modify directory entries. Admin-issued clinician invitations create a Supabase Auth identity and `CLINICIAN` membership through the server-only admin client. Deactivation suspends that linked membership and preserves directory/history records.

Apply `supabase/patches/004_departments_and_clinicians.sql` once to an existing database. It is additive and does not alter existing patient records.
