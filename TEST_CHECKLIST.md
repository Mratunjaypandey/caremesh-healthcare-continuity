# CareMesh final test checklist

## Authentication

- [ ] Real admin can sign in.
- [ ] Real patient can sign in.
- [ ] Invalid credentials show a useful error.
- [ ] Password recovery works through configured Supabase SMTP.
- [ ] Portal role mismatch is rejected.
- [ ] Protected routes redirect unauthenticated users.

## Admin

- [ ] Dashboard loads real organization data.
- [ ] Patient search works.
- [ ] Patient registration works.
- [ ] Duplicate mobile is blocked.
- [ ] OPD event can be created.
- [ ] Admission event can be created.
- [ ] Lab event can be created.
- [ ] Follow-up can be created.
- [ ] Appointment can be created/updated.
- [ ] Admin can add, edit and deactivate departments.
- [ ] Admin can add, edit and deactivate clinician directory entries.
- [ ] Admin can invite a clinician to a real Supabase portal account.
- [ ] Deactivating a linked clinician suspends their organization membership.
- [ ] Appointment forms prefer active department/clinician entries and preserve existing legacy text values.
- [ ] Notifications are generated.
- [ ] Documents can be uploaded.
- [ ] Patient-submitted documents can be accepted/rejected.
- [ ] Care gaps are recalculated.
- [ ] Audit records appear.
- [ ] Gemini history summary generates and is stored.
- [ ] PDF report downloads.

## Patient

- [ ] Patient sees only the linked record.
- [ ] Timeline loads.
- [ ] Timeline filters work.
- [ ] Patient note can be added.
- [ ] Document upload works.
- [ ] Document vault has one upload header (no duplicate nested heading).
- [ ] Upload action is reachable above the mobile bottom navigation.
- [ ] Appointment view works.
- [ ] Notification read state works.
- [ ] Profile update works.
- [ ] Password update works.
- [ ] Gemini history summary displays.
- [ ] CareMesh AI assistant answers from the patient's own context.
- [ ] AI assistant refuses diagnostic/treatment requests appropriately.

## PWA / mobile

- [ ] Site is usable at 360px width.
- [ ] Mobile drawer menu opens/closes on repeated menu-button taps.
- [ ] Mobile drawer displays full-width labels even if desktop sidebar preference was collapsed.
- [ ] Bottom navigation is hidden while the mobile drawer is open.
- [ ] Admin appointments form and registry stack instead of overlapping at phone widths.
- [ ] Bottom navigation works.
- [ ] Profile menu works.
- [ ] Chrome shows PWA install affordance on an installable HTTPS deployment.
- [ ] Installed app opens at `/` and preserves the CareMesh branding.
- [ ] No protected healthcare pages are cached by the service worker.
