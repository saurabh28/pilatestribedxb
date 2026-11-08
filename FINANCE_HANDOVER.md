# Purchases, receipts and the private coach connection

The upgrade preserves the existing app design, Supabase trainer login and original coaching records.

## Daily use

- **Sales & purchases** keeps package price and purchase date separate from the first-session date. Advance purchases remain unstarted until attended use.
- Record each payment separately, including split payments, method and reference. When only a month is known, retain that month without inventing a day.
- Outstanding amounts are calculated only for packages with known prices. Expected renewals are future planning amounts and never receipts.
- Voiding a mistaken payment preserves its original record and correction reason. Record the corrected receipt separately.
- Previously reported monthly totals are compared with itemised receipts; they are never added together. A difference means payment details are still needed.
- **Review records** links to missing package/contact details and expired packages. Imported visits strictly after a confirmed balance snapshot can be reconciled once. Same-day ambiguity requires review.
- Backups include all ten collections. Older backups can merge; replacement requires a complete backup including payments and monthly totals.

## Deployment order

1. Retain a private pre-upgrade database backup.
2. Apply the additive `purchases_payments_and_reconciliation` Supabase migration after approval.
3. Reconcile supported historical records and import confirmed receipts separately from the schema migration; never commit client data to this repository.
4. Build and deploy the same source through owner-private Sites hosting. The D1 migration provisions an encrypted-session store for the optional coach connection.
5. The owner opens **Connect ChatGPT**, signs in to the existing trainer account, then installs/connects the private Site plugin if necessary.

## Private connection

The Worker exposes bounded named tools for lookup, profile/balance summaries, attendance, notes, new purchases and received payments. It exposes no arbitrary SQL or URL proxy. Each database call uses the linked trainer JWT and existing RLS.

Linking uses a separate trainer session. The password goes only to Supabase sign-in; the server stores encrypted access/refresh tokens bound to the authenticated Site owner and trainer. Disconnect deletes that saved session. A refresh lock and stable write request IDs prevent duplicate refreshes and repeated writes.

Runtime secret names: `COACH_OWNER_EMAIL`, `COACH_TRAINER_ID`, `COACH_SUPABASE_URL`, `COACH_SUPABASE_KEY`, `COACH_SESSION_KEY`. Configure these through Sites; never commit their values. `COACH_SESSION_KEY` is 32 random bytes encoded as base64. No service-role key is used.

## Verification

`npm ci`, `npm test`, `npm run build`. The tests cover database account isolation, partial receipts, overpayment prevention, idempotency, corrections, reconciliation, complete backup/restore and private tool boundaries. `?demo=1` uses fictional in-memory records and never accesses Supabase.

Live trainer linking requires the owner's sign-in. Automated and fixture checks do not establish that an actual phone, trainer session or hosted upstream connection has been verified.
