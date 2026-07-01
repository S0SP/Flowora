# Flowra UI/UX Audit & Production-Ready Redesign Plan

## Audit Summary

13 pages, 1 dashboard layout, 1 auth layout, 4 shared UI primitives (mostly unused).
No shared design system — every page hand-builds cards, inputs, toggles, buttons.
Font: Comfortaa (done). Inter data fallback (done). Voice dropdown fix (done).

---

## 1. Structural Issues (highest impact)

### 1a. No Shared Component Library
The `ui/` folder has 4 files (empty-state, loading, message-status, skeleton) but none of the core primitives used across every page. Every page independently writes:
- Toggle switches (chatbot, lead-capture ×3, settings)
- Card wrappers (`bg-card border border-border rounded-2xl p-6 shadow-sm`)
- Form inputs (6+ slight variations of `rounded-xl border border-input bg-background`)
- Section headers (`text-xs font-semibold uppercase tracking-wider text-muted-foreground`)
- Status badges (each page has its own)
- Page header pattern (`h2 + p.subtitle`, or `h1 + p`, or `flex justify-between`)
- Submit/action buttons

**Fix: Create a minimal component library (`src/components/ui/`):**
- `toggle.tsx` — reusable toggle switch
- `card.tsx` — `PageCard` (header + border + padding + optional icon/title)
- `input.tsx` — `FormField` with label, error, hint, icon slots
- `section-header.tsx` — the uppercase tracking-wider label used everywhere
- `status-badge.tsx` — `Badge` with color variants
- `page-header.tsx` — `PageHeader(icon, title, subtitle, action?)`
- `button.tsx` — extend existing; primary/ghost/danger variants
- `select.tsx` — styled native select

### 1b. Page Layout Inconsistency
Each page sets its own `max-w-*` independently:
- Dashboard: no max (full width)
- Settings: `max-w-3xl` (narrow)
- Voice Agent: `max-w-7xl` (wide)
- Call History: `max-w-4xl` (medium)
- Voices Library: `max-w-5xl` (medium-wide)
- Lead Capture, Campaigns, Chatbot, Contacts, Inbox: none (full width)

**Fix:** Define a `PageShell` wrapper that applies consistent max-width and horizontal padding. Pages that need to be narrow can pass `size="narrow"`.

### 1c. Auth Layout is a Bare Fragment
`auth/layout.tsx` is `<>{children}</>` — the login page works fine, but there's no shared branding wrapper. Adding a subtle left/right split or branded background pattern would feel more intentional.

---

## 2. Page-by-Page Issues

### Login (`/auth/login`)
- **OK overall.** Clean centered card.
- Minor: no "Forgot password?" link. No logo image (just icon + text).
- Logo should use the actual Flowora brand mark if one exists.

### Dashboard (`/dashboard`)
- **Good.** Stat cards + recent campaigns.
- StatCard grid uses `xl:grid-cols-6` — too many columns at once, looks cramped.
- No quick-action buttons (e.g. "New Campaign", "View Inbox").

### Analytics (`/dashboard/analytics`)
- **Good structure** but duplicates the same 6 stat cards as Dashboard.
- Consider: merge analytics INTO dashboard as a second section/tab, or make analytics the deep-dive and dashboard the summary.

### Campaigns (`/dashboard/campaigns`)
- Clean. Server-rendered table + CampaignSender.
- CampaignSender is a separate component — verify its styling matches the new system.

### Chatbot (`/dashboard/chatbot`)
- **Dense.** The simulator is nice but the config panel has too many toggles stacked vertically.
- Toggle switches are hand-coded divs — replace with shared Toggle.
- Tool-calling section (Lead tool, Store tool) uses same toggle pattern 3x.

### Contacts (`/dashboard/contacts`)
- Minimal page. Just a count + ContactsTable component.
- If ContactsTable has its own styling, audit it separately.

### Inbox (`/dashboard/inbox`)
- Delegates to InboxClient. Needs separate audit of that component.
- No page header at all — just `<InboxClient />`.

### Lead Capture (`/dashboard/lead-capture`)
- **Most complex page.** 5-tab form + workflow visualization + activity log + leads table.
- Tabs are small text buttons with icons — fine, but the tab bar is `grid grid-cols-4` and there are 5 tabs (Voice tab overflows).
- The workflow pipeline SVG is clever but uses hardcoded pixel coordinates — won't scale.
- Activity log + leads table side-by-side is good.
- The Pause/Resume button (just added) is in the pipeline header — good placement.

### Settings (`/dashboard/settings`)
- **Good.** Clean BYOK sections with eye/password toggles.
- `max-w-3xl` is fine for this page — it's a form-heavy page.

### Voice Agent (`/dashboard/voice-agent`)
- **Best-designed page in the app.** Engine picker, dialer, voice grid, waveform animation, live call banner.
- Voice picker with play-sample is excellent UX.
- System prompt collapsible section is smart.
- Uses `SARVAM_VOICES` and `GEMINI_VOICES` from `lib/voices` — the lead-capture page should use these too (currently hardcodes its own copy).

### Call History (`/dashboard/voice-agent/calls`)
- **Good.** Expandable rows with audio player + transcript.
- Pagination is clean.

### Voice Library (`/dashboard/voice-agent/voices`)
- **Excellent.** Filterable grid with search, gender, model filters.
- Floating selection bar at bottom is a nice touch.

---

## 3. Multi-Workflow Support

### Current State
- `lead_capture_settings` table is single-row per user (the API does `limit(1)`).
- Only one config can exist.

### Required Changes

**Schema:**
```sql
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Untitled Workflow';
-- Remove the single-row assumption
```

**API (`/api/lead-capture`):**
- GET: return ALL settings rows (not limit 1)
- POST: allow creating new rows (don't auto-upsert existing)
- Add PATCH for partial updates (e.g. toggle is_active)
- Add DELETE

**Frontend:**
- Workflow list/selector at top of page
- "New Workflow" button
- Each workflow card shows: name, status (active/paused), channels enabled, last synced
- Clicking a workflow opens its config in the existing form
- The pipeline visualization updates to reflect the selected workflow

---

## 4. Font Notes (Comfortaa)

Comfortaa is geometric/rounded — excellent for headings and UI labels, but at small sizes (10px-11px) its rounded letterforms can feel soft. The `font-data: Inter` utility class is available for dense tables. Pages using `font-mono` for numbers (call history, activity log) are already fine. No action needed beyond what's done.

---

## 5. Execution Order (recommended)

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | Shared component library (Toggle, Card, Input, Badge, PageHeader, PageShell) | 1 session |
| **Phase 2** | Apply shared components to all 13 pages (mechanical, per-page) | 2-3 sessions |
| **Phase 3** | Multi-workflow schema + API + frontend | 1-2 sessions |
| **Phase 4** | Auth layout polish + landing page | 1 session |
| **Phase 5** | Merge lead-capture voice list with lib/voices (dedup) | trivial |

### What ships in Phase 1 (foundation):
- `src/components/ui/toggle.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/form-field.tsx`
- `src/components/ui/page-header.tsx`
- `src/components/ui/page-shell.tsx`
- `src/components/ui/badge.tsx`
- Update `tailwind.config.js` with any new tokens (if needed)
- Storybook-style test page optional

### What ships in Phase 2 (per-page polish):
Each page: swap hand-coded cards/toggles/inputs for shared components, fix max-width, fix header style, ensure consistent spacing. No behavior changes — pure visual consistency.

### What ships in Phase 3 (multi-workflow):
- Migration SQL file
- API rewrite (CRUD for multiple settings)
- Frontend: workflow list, new/edit/delete, selector UI
- Activity log + leads table scoped to selected workflow
