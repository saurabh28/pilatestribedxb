# Client Status: Active / Paused / Ended — Design

Status: Approved by owner 2026-09-26.

## Purpose

Today a client is either `"active"` or `"inactive"`, a plain binary with no way to record *why* someone stopped training, whether they're expected back, or how much of their package's freeze allowance they've used. This blocks two things the owner wants next: birthday-style reconnect reminders tied to a planned return date, and a general win-back nudge for clients who went quiet with no plan. It also has no notion of a client relationship actually ending (vs. just being on a break), so a "resume-soon" list and a "gone for good" list are currently the same bucket.

This redesign replaces the 2-state status with a 3-state one and adds freeze-allowance tracking tied to the client's package. It intentionally does **not** build the reminder logic itself — that's a separate, later spec (`reminders`) that will read the fields this spec introduces (`pauseResumeDate`, `statusReason`, `pausedAt`).

## Status model

`clients.status` (already a plain `text` column, no `check` constraint) takes one of three values instead of two:

- **`active`** — currently training. Unchanged meaning.
- **`paused`** — temporarily not training, but expected back. Covers both today's old "inactive" case (no defined return) and true freezes (has a return date). The two are distinguished only by whether `pauseResumeDate` is filled in, not by separate statuses — the owner confirmed this unification.
- **`ended`** — the relationship is over. **Always a manual, deliberate action by the coach, never automatic.** No reminders fire for ended clients. Their full history (sessions, goals, body scores, screenings) stays intact and queryable; they're just filtered out of the default Active/Paused views.

### New fields on `clients`

```sql
alter table clients
  add column status_reason text not null default '',
  add column pause_resume_date date,
  add column paused_at date,
  add column freeze_allowance_days integer not null default 7,
  add column freeze_days_used integer not null default 0;
```

- `status_reason` — free text. Meaning depends on current status: why they're paused, or why they ended. See "Three transitions, one implementation each" below for exactly when each transition sets or clears it.
- `pause_resume_date` — optional. Only meaningful while `status = 'paused'`. Null means "no defined return date" (the win-back case for the later reminders spec).
- `paused_at` — set automatically the moment a client *transitions into* `paused` (not user-editable, and not re-stamped by editing an existing pause's details — see below). Used to compute actual elapsed days when they resume.
- `freeze_allowance_days` — total freeze days allowed for the client's *current* package cycle. Defaults to 7 for a new client, editable per client wherever package fields (`packageTotalSessions` etc.) are edited. **Persists across package renewals** — it's a per-client entitlement the coach tunes (e.g. 14 days for a long-tenured client), not a per-cycle value, so renewing a package never silently reverts a customized allowance back to the default.
- `freeze_days_used` — cumulative freeze days consumed against the allowance during the current package cycle. This one **does** reset to 0, whenever `packageStartDate` is changed to a new value via the edit form (the signal that a package was renewed).

No new table. This is a data-shape addition to the existing `clients` row, same footprint as the rest of the client record.

## Freeze allowance behavior

Applies only when a pause has a `pauseResumeDate` (a defined-length freeze). Open-ended pauses never touch the allowance or the package expiry, since there's no length to measure yet — if a resume date is added to an open-ended pause later, the allowance math applies from that point.

**Live math wherever a resume date is editable:** the Reason + Resume-date sub-form (shared, per "Entry points" below) shows the planned length (`pauseResumeDate − today`) against `freeze_days_used / freeze_allowance_days` — e.g. if 2 days are already used against a 7-day allowance and this pause plans for 10 more days, it shows "10 days — this brings you to 12 of 7 days used" with warning styling. This applies both when *starting* a new pause and when *editing* the resume date of an already-paused client (e.g. extending a trip) — it's a property of the shared sub-form, not just the initial popup. It's informational only; submitting is never blocked, matching the "ended is manual, coach always has final say" principle already established for this feature.

### Three transitions, one implementation each

To guarantee the quick-action buttons and the full edit-client form never diverge in behavior, each transition is a single pure function both entry points call — neither surface re-implements the logic independently:

- **`startPausePatch(reason, resumeDate)`** → fires only on an **Active → Paused transition** (or Ended → Paused, if that's ever used): `{ status: "paused", statusReason: reason, pauseResumeDate: resumeDate, pausedAt: todayIso() }`. **Editing an already-paused client's reason or resume date — no status change — must not call this function and must not touch `pausedAt`.** It's a plain field patch (`{ statusReason, pauseResumeDate }` only), since `pausedAt` marks when the *current* pause began and must survive edits to its details.
- **`resumeFromPausePatch(client, todayIso)`** → fires only on a **Paused → Active transition** (via the one-click button or the form). Elapsed days = `todayIso − client.pausedAt` (the *actual* days paused, not the originally planned length — a 10-day planned trip cut short to 6 only uses 6). Returns:
  1. `freezeDaysUsed: client.freezeDaysUsed + elapsedDays`
  2. `packageExpiryDate: client.packageExpiryDate ? addDays(client.packageExpiryDate, elapsedDays) : client.packageExpiryDate`
  3. `pauseResumeDate: null, pausedAt: null, statusReason: "", status: "active"`
- **`endClientPatch(reason)`** → fires on **any transition to Ended** (from Active or Paused): `{ status: "ended", statusReason: reason, pauseResumeDate: null, pausedAt: null }`. Always overwrites `statusReason` with whatever is entered (even blank), discarding any prior pause reason. **Does not** touch `freezeDaysUsed`/`freezeAllowanceDays` — those are left as a historical record, and does **not** run the elapsed-day math from `resumeFromPausePatch` — that calculation only makes sense when protecting a *future* package cycle, which Ended doesn't have.

## Entry points

**Client profile header** (`app.js` ClientProfile, near the existing status badge around line 1375) gets up to two quick-action buttons depending on current status:

- **When Active:** "Pause" button → small modal with the shared Reason + Resume-date sub-form. Submitting calls `clientRepository.update(id, startPausePatch(reason, resumeDate))`.
- **When Paused:** "Resume" button (one click, no modal) calling `clientRepository.update(id, resumeFromPausePatch(client, todayIso()))`, and "Mark Ended" button → small modal with Reason, calling `clientRepository.update(id, endClientPatch(reason))`.
- **When Ended:** no quick actions shown; reactivating is a deliberate edit via the full client form (below), not a one-click action, since un-ending someone is rare enough not to warrant a shortcut.

**Edit-client form** (`ClientFormPage`) — the Status `<select>` (currently `active`/`inactive`, `app.js:690`) gains a third `ended` option and relabels `inactive` to `paused`. On submit, the form computes which of the three patch functions above to merge in (if any) by comparing the *previous* status to the newly selected one — `active→paused` calls `startPausePatch`, `paused→active` calls `resumeFromPausePatch`, anything `→ended` calls `endClientPatch`, and **no status change at all** (already `paused`, still `paused`) just patches `statusReason`/`pauseResumeDate` directly without touching `pausedAt`, exactly like the "editing an existing pause" case above. This guarantees the form can never skip the freeze accounting just because the coach used it instead of the buttons.
  - When `paused` is selected (whether newly selected or already the current status), the same Reason + Resume-date sub-form appears inline, live freeze-math included.
  - When `ended` is selected, a Reason field appears inline too (same field, `statusReason`) — the quick-action modal and the form must offer the same input for the same transition.
- This form is also where `freezeAllowanceDays` lives as a plain editable number field, in the package section next to `packageTotalSessions`/`packageStartDate` — it's how the coach raises it for a longer package or a long-tenured client. New clients default to 7 (the DB column default) if left untouched.
- Separately from the three status transitions above, the same submit handler also checks whether `packageStartDate` changed from its previous value; if so it adds `freezeDaysUsed: 0` to the patch (the package-renewal signal from the field description above). This check is independent of and can coincide with a status transition in the same save — if both fire, the renewal's `freezeDaysUsed: 0` is applied after whichever transition patch, since a fresh package cycle always starts unused regardless of what the status change alone would have computed.

## Data migration

One-time SQL, run once against the live database:

```sql
update clients set status = 'paused' where status = 'inactive';
```

Per the owner's decision, existing "Inactive" clients become "Paused" (not "Ended") — the safer default, since it surfaces them for review rather than silently writing them off. `status_reason` and `pause_resume_date` stay blank for these until the coach fills them in.

## Touch points to update

- `app.js:577` — client list status filter options: `active`/`inactive`/`all` → `active`/`paused`/`ended`/`all`.
- `app.js:591`, `app.js:1679` — inline status badges in client list rows.
- `app.js:690` — Status `<select>` in `ClientFormPage`, plus new conditional Reason/Resume-date/Ended-reason fields, plus a new `freezeAllowanceDays` number field in the package section.
- `app.js:1375` — status badge + new quick-action buttons in `ClientProfile` header.
- `app.js:481`, `app.js:487` — dashboard "Active clients" counts: unaffected, still `status === "active"` only (Paused and Ended are both correctly excluded from "active" the same way "inactive" was before).
- A shared `CLIENT_STATUS_BADGE` config map (tone + label per status) replaces the current inline ternaries, so the three-way badge logic lives in one place instead of being repeated at every call site — same config-driven pattern as `CATEGORY_FIELD_CONFIG`. Named distinctly from the existing `STATUS_TONE` (goal status, a different domain) to avoid the two being confused at a glance.
- `startPausePatch`, `resumeFromPausePatch`, `endClientPatch` — new pure functions in `data.js` (alongside `calculateAge`, `clientToRow`), used identically by the quick-action buttons and the edit-form submit handler.

## Testing

Pure functions get Node tests via the existing `test/helpers/load-browser-script.js` harness:
- `daysBetween(a, b)` / `addDays(iso, n)` — used for both the planned-length math and the resume-time elapsed math.
- `startPausePatch`, `resumeFromPausePatch`, `endClientPatch` — each tested directly: `resumeFromPausePatch` covers elapsed days added to `freezeDaysUsed`/`packageExpiryDate` and all fields clearing correctly; `endClientPatch` covers that it does *not* touch `freezeDaysUsed`/`packageExpiryDate`; `startPausePatch` covers that it stamps `pausedAt` to today.
- A same-status edit (already `paused`, still `paused`) does not go through `startPausePatch` and leaves `pausedAt` unchanged — tested at the form's transition-dispatch logic, not just the patch functions in isolation.
- `CLIENT_STATUS_BADGE` has an entry for all three statuses.

UI (modals, quick-action buttons, conditional form fields) verified manually in the browser preview, same limitation as the rest of this app.

## Explicitly out of scope (future work, noted so it isn't lost)

- **Package validity/tiers.** The owner flagged that package types with a defined validity/duration (and a matching default freeze allowance per tier) don't exist yet — packages are currently ad hoc per-client fields (`packageTotalSessions`, `packageStartDate`, `packageExpiryDate`). This spec keeps `freezeAllowanceDays` as a simple per-client editable number rather than deriving it from a package catalog. Revisit once package tiers are designed.
- **Reminders** (birthday, freeze-reconnect, win-back nudge for open-ended pauses) — separate spec, reads `pauseResumeDate`/`statusReason`/`pausedAt` but isn't built here.
- **Freeze history.** Only the *current* pause's reason/dates are stored; past pauses aren't logged anywhere once a client resumes. Acceptable per YAGNI — revisit only if the coach later wants a full pause history per client.
