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

- `status_reason` — free text. Meaning depends on current status: why they're paused, or why they ended. Cleared (reset to `''`) whenever status transitions to `active`.
- `pause_resume_date` — optional. Only meaningful while `status = 'paused'`. Null means "no defined return date" (the win-back case for the later reminders spec). Cleared on any transition away from `paused`.
- `paused_at` — set automatically to today's date the moment status becomes `paused` (not user-editable). Used to compute actual elapsed days when they resume. Cleared on any transition away from `paused`.
- `freeze_allowance_days` — total freeze days allowed for the client's *current* package cycle. Defaults to 7 for a new client, editable per client wherever package fields (`packageTotalSessions` etc.) are edited. **Persists across package renewals** — it's a per-client entitlement the coach tunes (e.g. 14 days for a long-tenured client), not a per-cycle value, so renewing a package never silently reverts a customized allowance back to the default.
- `freeze_days_used` — cumulative freeze days consumed against the allowance during the current package cycle. This one **does** reset to 0, whenever `packageStartDate` is changed to a new value via the edit form (the signal that a package was renewed).

No new table. This is a data-shape addition to the existing `clients` row, same footprint as the rest of the client record.

## Freeze allowance behavior

Applies only when a pause has a `pauseResumeDate` (a defined-length freeze). Open-ended pauses never touch the allowance or the package expiry, since there's no length to measure yet — if a resume date is added to an open-ended pause later, the allowance math applies from that point.

**Starting a pause with a resume date:** the pause popup shows the planned length (`pauseResumeDate - today`) against `freeze_days_used / freeze_allowance_days`, e.g. "10 days — this brings you to 12 of 7 days used" with warning styling if it exceeds the remaining allowance. This is informational only; submitting is never blocked, matching the "ended is manual, coach always has final say" principle already established for this feature.

**Resuming:** elapsed days = `today - paused_at` (the *actual* days paused, not the originally planned length — someone who plans a 10-day trip but comes back after 6 only uses 6). This value:
1. Is added to `freeze_days_used`.
2. Is added to `packageExpiryDate` if one is set (so paused time isn't lost off the package), per the owner's explicit confirmation.
3. Triggers `pause_resume_date`, `paused_at`, and `status_reason` all clearing back to their empty defaults, and `status` becoming `active`.

## Entry points

**Client profile header** (`app.js` ClientProfile, near the existing status badge around line 1375) gets up to two quick-action buttons depending on current status:

- **When Active:** "Pause" button → small modal with Reason (optional text) and Expected resume date (optional date). Live freeze-allowance math shown under the date field once one is entered. Submitting calls `clientRepository.update(id, { status: "paused", statusReason, pauseResumeDate, pausedAt: todayIso() })`.
- **When Paused:** "Resume" button (one click, no modal — computes and applies the elapsed-days math above immediately) and "Mark Ended" button → small modal with an optional Reason. Submitting the Ended modal always overwrites `statusReason` with whatever is entered (even blank), discarding the prior pause reason — it should read as "why the relationship ended," not carry over stale pause context.
- **When Ended:** no quick actions shown; reactivating is a deliberate edit via the full client form (below), not a one-click action, since un-ending someone is rare enough not to warrant a shortcut.

**Edit-client form** (`ClientFormPage`) — the Status `<select>` (currently `active`/`inactive`, `app.js:690`) gains a third `ended` option and relabels `inactive` to `paused`. When `paused` is selected here, the same Reason/Resume-date fields appear inline (reusing the same sub-form as the popup, not a duplicate implementation). This is the fallback path for edge cases (bulk-editing other fields at the same time, or manually re-activating an Ended client by switching back to `active`).

## Data migration

One-time SQL, run once against the live database:

```sql
update clients set status = 'paused' where status = 'inactive';
```

Per the owner's decision, existing "Inactive" clients become "Paused" (not "Ended") — the safer default, since it surfaces them for review rather than silently writing them off. `status_reason` and `pause_resume_date` stay blank for these until the coach fills them in.

## Touch points to update

- `app.js:577` — client list status filter options: `active`/`inactive`/`all` → `active`/`paused`/`ended`/`all`.
- `app.js:591`, `app.js:1679` — inline status badges in client list rows.
- `app.js:690` — Status `<select>` in `ClientFormPage`, plus new conditional Reason/Resume-date fields.
- `app.js:1375` — status badge + new quick-action buttons in `ClientProfile` header.
- `app.js:481`, `app.js:487` — dashboard "Active clients" counts: unaffected, still `status === "active"` only (Paused and Ended are both correctly excluded from "active" the same way "inactive" was before).
- A shared `STATUS_BADGE` config map (tone + label per status) replaces the current inline ternaries, so the three-way badge logic lives in one place instead of being repeated at every call site — same config-driven pattern as `CATEGORY_FIELD_CONFIG` and `STATUS_TONE`.

## Testing

Pure functions get Node tests via the existing `test/helpers/load-browser-script.js` harness:
- `daysBetween(a, b)` (or equivalent elapsed-days helper) — used for the resume-time allowance/expiry math.
- The resume transition's computed patch (elapsed days added to `freezeDaysUsed` and `packageExpiryDate`, fields cleared correctly) — tested as a pure function of `(client, todayIso)` rather than by driving the UI.
- `STATUS_BADGE` has an entry for all three statuses.

UI (modals, quick-action buttons, conditional form fields) verified manually in the browser preview, same limitation as the rest of this app.

## Explicitly out of scope (future work, noted so it isn't lost)

- **Package validity/tiers.** The owner flagged that package types with a defined validity/duration (and a matching default freeze allowance per tier) don't exist yet — packages are currently ad hoc per-client fields (`packageTotalSessions`, `packageStartDate`, `packageExpiryDate`). This spec keeps `freezeAllowanceDays` as a simple per-client editable number rather than deriving it from a package catalog. Revisit once package tiers are designed.
- **Reminders** (birthday, freeze-reconnect, win-back nudge for open-ended pauses) — separate spec, reads `pauseResumeDate`/`statusReason`/`pausedAt` but isn't built here.
- **Freeze history.** Only the *current* pause's reason/dates are stored; past pauses aren't logged anywhere once a client resumes. Acceptable per YAGNI — revisit only if the coach later wants a full pause history per client.
