# Standardize UI Toggles & Centralize Meta API Usage

This plan addresses the two major requests: fixing the dark mode styling for all toggle switches across the app to match the Inbox AI Chatbot toggle, and executing a widespread refactoring of 9 API routes to use the central `meta-api.ts` SDK instead of raw `fetch` calls.

## User Review Required
> [!IMPORTANT]
> **API Route Refactoring**
> We are going to replace raw `fetch` requests with `meta-api.ts` functions in 9 critical backend files. This will make your app much more stable and future-proof (automatically handling rate limits, Meta API v21.0 standards, and detailed error logging).
> 
> Please review the list of files below to ensure you are comfortable with these backend changes.

> [!TIP]
> **Dynamic Template Variables**
> I reviewed `src/lib/whatsapp/meta-api.ts` and **yes, it already fully supports dynamic variables!** The `sendTemplateMessage` function takes a `params` array which it injects perfectly into the WhatsApp API payload. We will utilize this to unlock variable sending everywhere.

## Proposed Changes

### 1. UI Toggle Standardization
The AI Chatbot toggle in the inbox works perfectly because it uses a custom `button` implementation with specific Tailwind classes (`bg-green-500`, `bg-gray-200 dark:bg-gray-700`, smooth translate animations).
We will extract this exact styling and update `src/components/ui/toggle.tsx` to behave identically. Then, we will replace all hand-coded `peer-checked` checkboxes across the app (Lead Capture, Settings, Campaigns, etc.) with this unified component.

#### [MODIFY] `src/components/ui/toggle.tsx`
Update to match the Inbox AI Chatbot toggle styling.

#### [MODIFY] `src/components/lead-capture/lead-capture-client.tsx`
Replace the 4 custom checkboxes with the new `<Toggle />` component.

#### [MODIFY] `src/app/dashboard/inbox/page.tsx`
Replace the hand-coded AI Chatbot toggle with the unified `<Toggle />` component.

#### [MODIFY] `src/app/dashboard/settings/page.tsx` (and other settings panels)
Replace any other hand-coded toggles.

---

### 2. Meta API Centralization (Backend Refactoring)
Remove all raw `fetch('https://graph.facebook.com/...')` calls and replace them with the robust `meta-api.ts` SDK.

#### [MODIFY] `src/app/api/jobs/workflow-step/route.ts`
Refactor to use `sendTextMessage` and `sendTemplateMessage`. Support dynamic variables.

#### [MODIFY] `src/app/api/workflows/trigger/route.ts`
Refactor to use `sendTemplateMessage`.

#### [MODIFY] `src/app/api/jobs/campaign-execute/route.ts`
Refactor to use `sendTemplateMessage`.

#### [MODIFY] `src/app/api/inbox/threads/[id]/messages/route.ts`
Refactor manual inbox replies to use `sendTextMessage` and `sendMediaMessage`.

#### [MODIFY] `src/app/api/cron/send-reminders/route.ts`
Refactor to use `sendTemplateMessage`.

#### [MODIFY] `src/services/tickets.ts`
Refactor auto-responses to use `sendTextMessage`.

#### [MODIFY] `src/app/api/webhooks/whatsapp/route.ts`
Refactor webhook automated responses to use `meta-api.ts`.

#### [MODIFY] `src/app/api/inbox/upload-media/route.ts`
Refactor to use `uploadResumableMedia` from `meta-api.ts`.

#### [MODIFY] `src/app/api/templates/route.ts`
Refactor to use `getMetaTemplates` (or similar fetch logic) from `src/services/meta.ts` / `meta-api.ts`.

## Verification Plan
### Automated Tests
- Run TypeScript build `npx tsc --noEmit` to ensure no typing errors were introduced during the massive API refactoring.
### Manual Verification
- Test toggles in dark mode to verify the green active state and gray inactive state work perfectly.
- Ensure the app compiles and the replaced API routes function by tracing the updated SDK implementations.
