# Pilates Tribe · Client Studio

Upgrade of saurabh28/pilatestribedxb, retaining the existing trainer login, Supabase project, client profiles, workout templates, exercise editor, training calendar, goals, body scores, and movement screening.

## Daily use

- Record a visit from **Record**. Add an optional session note and select the package to charge. Cancellations consume nothing; no-shows and late cancellations consume a session only when explicitly selected.
- Client **Packages** keeps every renewal separately. A new advance package starts on first attended use. Existing usage can be brought forward separately from recorded attendance.
- **Attendance** keeps entries, notes, and corrections. Undo returns a charged session and untracks any calendar assignment without deleting history.
- **Renewals** includes low balances, completed/expired packages and approaching expiry. Deferred clients remain in a separate list. Expected renewal amounts are future pipeline, not received sales.
- **Settings** exports all eight data collections. Restore runs in one transaction; invalid imports roll back. Merge supports older backups; replacement requires a complete export.

## Development and verification

`npm ci`, `npm run build`, `npm test`.

Runtime libraries are version-pinned and bundled into `dist/vendor`. A fictional `?demo=1` workspace uses only memory and never calls Supabase. It is intentionally reset on reload.

The additive migration in `supabase/migrations/` creates the package ledger, attendance fields, database validation and row locks, revision-based updates, complete restore, and cross-account ownership checks. Legacy package fields and original records are retained. The migration was tested in isolated PostgreSQL (PGlite) using fictional records.

## Hosting and rollback

The tracked `.openai/hosting.json` points to the owner-private Sites project. Its static output is `dist`. Production sign-in first passes the Sites owner gate, then uses the existing Supabase trainer account. No service-role keys are present in browser code.

Keep the pre-upgrade private database snapshot. A deployment can be rolled back to the previous saved Sites version. The database upgrade is additive: original columns remain usable by the unchanged beta app. Package activity entered in the upgraded app should be managed there; the old beta does not show the new multi-package ledger. Do not drop added tables or columns to roll back the UI.
