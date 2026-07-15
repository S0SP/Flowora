# Flowora — Backend Implementation Plan

How to get from the **current single-tenant WhatsApp CRM** to the **multi-tenant Flowora OS** described in `01_BACKEND_ARCHITECTURE.md` and `02_DB_SCHEMA.sql`. Everything is Next.js. The **voice agent runtime stays on Railway**; the **old voice-agent UI is kept** (not the new mockup voice screens).

---

## A. What already exists (reuse — do NOT rebuild)

| Area | Files | Keep because |
|---|---|---|
| Supabase wiring | `lib/supabase/{server,client}.ts`, `middleware.ts` | Auth session already works; just extend |
| WhatsApp send | `services/meta.ts` | Cloud API text/template send is correct |
| AI chatbot | `services/ai.ts`, `services/gemini-cache.ts` | Gemini→Groq fallback, function-calling, history pruning, prompt caching all solid |
| Email | `services/mailer.ts` | SMTP send + template compile |
| Voice runtime glue | `services/vapi.ts`, `lib/livekit.ts` (dialSip, egress) | Talks to Railway worker; keep contract |
| Lead capture | `services/lead-capture.ts` | Sheet→WA/Email/Voice logic + `row_hash` dedupe |
| Webhook ingest | `app/api/webhook/route.ts` | Meta message + status parsing |
| Campaign send | `app/api/campaigns/*`, `services/scheduler.ts` | Fan-out logic |
| Voice APIs | `app/api/voice/*` (calls, dial, transcript, webhook, cleanup) | Full call pipeline |
| Voice UI (OLD) | `app/dashboard/voice-agent/*`, `app/dashboard/voice/page.tsx`, `voices/page.tsx`, `calls/page.tsx`, `lib/voices.ts` | **Explicitly keep the old voice UI** |
| Data tables/UI kit | `components/*`, existing shadcn/radix setup | Matches frontend stack |

## B. What must change (add tenancy + real RLS + auth context)

1. **Schema migration to multi-tenant** (`02_DB_SCHEMA.sql`)
   - Add `workspaces / profiles / workspace_members / invitations`.
   - Add `workspace_id` to `contacts, messages, campaigns` (+ new `conversations`, `campaign_recipients`).
   - Migrate the **singleton settings** (`chatbot_settings`, `voice_agent_settings`, `lead_capture_settings` read with `.single()`) into **per-workspace rows** (`chatbots`, `voice_agents`, `lead_capture_settings`, `channel_connections`).
   - Replace permissive "authenticated = full access" RLS with membership-based policies + `is_workspace_member()` / `auth_has_permission()`.

2. **Every API route** (`app/api/*`)
   - Resolve `workspaceId` from the session's active workspace; pass to services.
   - Stop using `.single()` on settings; select `where workspace_id = ?`.
   - Validate input with **Zod**; project away secret columns before returning.

3. **Services** take explicit `workspaceId`:
   - `meta.ts`, `ai.ts`, `mailer.ts` resolve BYOK creds from `channel_connections` (decrypt via `lib/crypto.ts`) instead of the global `chatbot_settings` row.
   - `ai.ts` calls `credits.debit()` per generation.

4. **Async correctness**: replace in-process locks (`isSyncing`, `isProcessingLeads`, `setTimeout`) with **QStash** jobs + Postgres `for update skip loop`/`skip locked` claim pattern so it's safe across many instances.

5. **`middleware.ts`**: after auth, resolve active workspace cookie (`fw_ws`) and redirect to `/onboarding` when `onboarding_completed = false`.

## C. What to build new

| Module | New tables | New services / routes |
|---|---|---|
| Tenancy & onboarding | workspaces, profiles, members, invitations, workspace_settings | onboarding wizard → `POST /api/workspaces`, invite accept |
| Inbox v2 | conversations, conversation_notes, canned_replies | `services/inbox.ts`, `/api/inbox/{assign,tags,notes,canned}` |
| CRM | pipelines, pipeline_stages, leads, activities | `/api/leads`, drag-reorder endpoint |
| Credits & billing | plans, subscriptions, credit_wallets, credit_ledger, invoices | `services/credits.ts`, `services/billing.ts`, `/api/billing/webhook` (Stripe) |
| Workflows | workflows, workflow_runs, workflow_run_steps, workflow_templates | `services/workflow-engine.ts`, `/api/workflows`, `/api/jobs/workflow-step` |
| Knowledge / RAG | knowledge_bases, knowledge_documents, knowledge_chunks, kg_nodes, kg_edges | `services/knowledge.ts`, `/api/knowledge/*`, `/api/jobs/embed` |
| Integrations/API | integrations, api_keys, webhooks, webhook_deliveries | `services/integrations.ts`, OAuth callbacks |
| Notifications/Audit | notifications, audit_log, dashboard_daily_metrics | `services/notifications.ts`, `services/audit.ts`, cron rollup |
| **Voice cloning** | cloned_voices | `/api/voice/clone`, `/api/voice/clone-webhook`; extend OLD voice UI with upload panel |

## D. Voice cloning — concrete steps

1. Add `cloned_voices` table (in schema) + `voice-samples` storage bucket.
2. **UI (old voice-agent screen)**: add a "Clone a Voice" card → upload audio → `POST /api/voice/clone`.
3. `POST /api/voice/clone`: store sample in `voice-samples`, insert `cloned_voices(status='processing')`, enqueue clone job to Railway worker (`POST {RAILWAY_URL}/clone` with `VOICE_WORKER_SECRET`, sample signed URL, workspace_id).
4. Railway worker trains/registers voice (Sarvam/ElevenLabs) → callback `POST /api/voice/clone-webhook` → set `status='ready'`, `provider_voice_id`, `preview_url`.
5. Voice selection lists **built-in voices** (`lib/voices.ts`) **+ ready `cloned_voices`**. `voice_agents.voice_id` or `voice_agents.cloned_voice_id` chooses which; `dialSip()` passes the resolved provider id in room metadata.

## E. Environment variables (extend `.env.example`)

```
# existing
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
META_PHONE_NUMBER_ID=
META_WABA_ID=
META_VERIFY_TOKEN=
# new
ENCRYPTION_KEY=                  # pgcrypto/app-side secret encryption
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GEMINI_API_KEY=
GROQ_API_KEY=
EMBEDDING_API_KEY=
RAILWAY_VOICE_WORKER_URL=        # base URL of the Railway voice agent
VOICE_WORKER_SECRET=             # shared secret web <-> Railway
```

## F. Build order (each phase = one PR, applied over the schema file)

1. **Tenancy foundation** — new identity/tenant tables, RLS helpers, auth trigger, `workspace_id` backfill migration, middleware + onboarding wiring. *Gate: existing features keep working, now scoped to one seeded workspace.*
2. **Inbox v2** — conversations threading + assignment/tags/notes/canned + Realtime.
3. **CRM** — pipeline/leads kanban + activities.
4. **Credits & Billing** — wallet/ledger/plans/Stripe; wire `debit_credits()` into ai/voice/campaign.
5. **Workflows** — persistence + engine + QStash timers + run logs.
6. **Knowledge/RAG** — pgvector ingest/retrieve + Graph RAG.
7. **Integrations / API keys / Webhooks / Notifications / Audit**.
8. **Voice cloning** — `cloned_voices` + Railway `/clone` contract + old-UI upload panel.
9. **Hardening** — Redis caching of settings/balance, `dashboard_daily_metrics` rollup cron, rate limits, keyset pagination, load test.

## G. Migration safety for existing data

- Create workspaces/profiles first; seed **one workspace** for current data.
- `update contacts/messages/campaigns set workspace_id = <seed_ws>` (backfill) before adding `not null`.
- Copy singleton `chatbot_settings` → `chatbots` + `channel_connections`; `voice_agent_settings` → `voice_agents`; keep old columns until cutover verified.
- Swap permissive RLS policies for membership policies **only after** backfill + service-role paths pass `workspace_id`.
