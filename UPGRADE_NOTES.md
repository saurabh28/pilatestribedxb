# Upgrade notes

Original source base: 665d20960f85e2eaba88af49a0c80493dc9bbb05.

The public beta source is unchanged. This branch preserves its features and adds package and attendance management, renewals, complete backups, and private Sites hosting.

Validation covers database migrations, access policies, cross-account references, advance packages, deductions, duplicate times, insufficient balance, no-charge cancellations, undo history, revision conflicts, all-collection restore and rollback, older backup merges, calendar untracking, and competing writes for one remaining session. Existing exercise, screening, training, and template tests are retained.

Production verification must compare original client/session/goal/template/screening/calendar counts and package balances before and after migration. Private fixture data belongs only in the isolated test database or the explicit in-memory demo.

The existing Auth advisory for leaked-password protection needs review in the Supabase dashboard. No account, password, authentication provider, or billing settings are altered by this upgrade.
