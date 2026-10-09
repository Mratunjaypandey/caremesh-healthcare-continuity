# Supabase setup order

## Fresh project

1. Run `reset_caremesh_setup.sql` only when this is a new/empty CareMesh project or you intentionally want to remove the existing CareMesh schema.
2. Run `migrations/001_caremesh.sql`.
3. Run `npm run bootstrap:admin ...` from the application root.

## Existing production data

Do **not** run the reset script. Create a new numbered migration that changes only the required object(s). Never drop application tables or enum types in a live project just to make the original bootstrap migration rerun.


## Existing working CareMesh database — team directory

Apply this additive migration once after the base schema and patient-booking patch:

3. `patches/004_departments_and_clinicians.sql` (department and clinician management)

It creates organization-scoped `departments` and `clinicians` tables with RLS. Do not run the reset script or migration 001 again on a live database.
