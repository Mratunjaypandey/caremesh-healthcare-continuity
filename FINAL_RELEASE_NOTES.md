# CareMesh Final Release Notes

## Final polish / reliability release

### UX fixes
- Profile & settings is now inside the authenticated AppShell, so the profile page includes the same navigation, header, account menu and mobile controls as the rest of CareMesh.
- Desktop navigation is grouped and more prominent, with an account card at the top and explicit Profile & settings access.
- Mobile navigation is a five-item bottom bar with Menu opening the complete navigation drawer.
- Content width, spacing, mobile safe-area padding and horizontal overflow were tightened for phone and desktop.
- AI assistant drawer uses a fixed, flex-based layout so the message composer remains visible and usable at the bottom.
- AI full-page view uses a bounded viewport layout with an independently scrolling conversation area.
- Document management now uses searchable/filterable card layouts that are easier to use on a phone.

### Gemini reliability
- Replaced the fragile Interactions-only integration with the documented `generateContent` endpoint.
- Primary model defaults to `gemini-3.6-flash`.
- Fallbacks: `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash-lite`.
- Retries transient 408/429/5xx failures with exponential backoff and jitter.
- Skips a model that is not available to the project and tries the next one.
- Invalid API-key/authentication errors are surfaced rather than silently swallowed.
- If all models are temporarily unavailable, patient navigation answers fall back to the patient's own Supabase record for appointments, documents, timeline and continuity gaps.
- AI history summaries likewise fall back to a deterministic source-backed record summary so the application remains usable during temporary model capacity issues.

### Data / security
- No demo users or demo records are added by this release.
- Existing Supabase database and RLS configuration are reused.
- Patient AI requests remain server-side and are restricted to the authenticated patient's linked record.
- The browser never receives Supabase service-role credentials or the Gemini API key.

## Validation performed in the build environment

- TypeScript/TSX parser validation completed for every changed TypeScript file.
- CSS brace/syntax-balance check completed.
- Full `npm install` / `next build` could not be completed in the sandbox because npm registry access timed out; run `npm install`, `npm run typecheck`, and `npm run build` locally before deployment.
