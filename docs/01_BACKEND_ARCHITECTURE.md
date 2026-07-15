# Flowora — Backend Architecture

> AI Communication OS (WhatsApp · Email · Voice) — Next.js + Supabase
> Target: multi-tenant enterprise SaaS, horizontally scalable, low-latency.
> The **voice agent runtime** (Sarvam/Gemini live over LiveKit SIP) stays deployed **separately on Railway**. This document covers **everything else** and the contract between the web app and the Railway voice worker.

---

## 0. TL;DR — the one big change

The current app is a **single-tenant WhatsApp CRM**. Flowora is a **multi-tenant SaaS**. The single change that touches everything: introduce a **`workspace` (tenant)** boundary and hang every row off `workspace_id`, with Supabase Auth + RLS enforcing isolation. Everything already built is **reused**; it just gets a `workspace_id` column, real RLS, and is promoted from a global singleton (`.single()` settings rows) to per-workspace rows.

| Verdict | Count | Examples |
|---|---|---|
| **Reuse as-is** | ~60% | `meta.ts`, `ai.ts`, `mailer.ts`, `livekit.ts`, `vapi.ts`, gemini-cache, webhook parsing, campaign sender, voice call/egress/transcript pipeline, **old voice-agent UI** |
| **Change (add tenancy + RLS + auth ctx)** | ~30% | every API route, every `.single()` settings read, `contacts/messages/campaigns` tables |
| **Build new** | ~10% | workspaces/members/roles, credits & billing, CRM pipeline (kanban), persisted workflows + engine, knowledge base (pgvector + Graph RAG), integrations/webhooks/api-keys, notifications, voice **cloning**, shared-inbox assignment/tags/notes |

---

## 1. System context

```
                         ┌───────────────────────────────────────────────┐
                         │                 CLIENTS                        │
                         │  Web app (Next.js RSC + React 19)  ·  PWA/mobile│
                         └───────────────┬───────────────────────────────┘
                                         │ HTTPS (Supabase JWT in cookie)
                    ┌────────────────────┴─────────────────────┐
                    │            NEXT.JS (Vercel/Node)          │
                    │  ┌─────────────┐   ┌────────────────────┐ │
                    │  │ RSC / Pages │   │  Route Handlers    │ │
                    │  │ (read data) │   │  /api/*  (mutations,│ │
                    │  └─────────────┘   │  webhooks, cron)   │ │
                    │        middleware.ts (auth + tenant)     │ │
                    │  ┌──────────────────────────────────────┐│
                    │  │ services/  meta · ai · mailer ·       ││
                    │  │ livekit · credits · workflow-engine   ││
                    │  └──────────────────────────────────────┘│
                    └───┬───────────┬────────────┬────────┬─────┘
                        │           │            │        │
             ┌──────────▼─┐  ┌──────▼──────┐ ┌───▼────┐ ┌─▼──────────────┐
             │  SUPABASE   │  │  UPSTASH    │ │ QSTASH │ │ EXTERNAL APIs  │
             │ Postgres +  │  │  Redis      │ │ (jobs, │ │ Meta WA Cloud  │
             │ Auth + RLS +│  │ (cache,     │ │ delays,│ │ Gemini · Groq  │
             │ Storage +   │  │  ratelimit, │ │ retries)│ │ Stripe · SMTP  │
             │ Realtime +  │  │  presence)  │ └───┬────┘ │ Google OAuth   │
             │ pgvector    │  └─────────────┘     │      └────────────────┘
             └──────┬──────┘                      │
                    │ Realtime (WS)               │ HTTPS callbacks
                    │                    ┌────────▼─────────────────────────┐
                    └───────────────────►│  RAILWAY — VOICE AGENT WORKER     │
                       webhooks/status   │  LiveKit Agents (Python) ·        │
                                         │  Sarvam TTS/STT · Gemini Live ·   │
                                         │  SIP trunk · egress recording ·   │
                                         │  voice-cloning inference          │
                                         └───────────────────────────────────┘
```

**Why this split**
- **Next.js** = API + SSR + orchestration. Stateless, scales horizontally behind Vercel/Node.
- **Supabase Postgres** = single source of truth, RLS = tenant isolation, Realtime = inbox/live updates, Storage = media/recordings/voice samples, pgvector = RAG.
- **Upstash Redis** = hot cache (settings, credit balance), rate limiting, presence, dedupe.
- **QStash (or Supabase pg_cron + Edge Functions)** = durable async: campaign fan-out, workflow delays, retries, scheduled jobs. Replaces the current in-process `isSyncing`/`isProcessingLeads` locks that don't survive multiple instances.
- **Railway voice worker** = long-lived, stateful media process. Kept off Vercel (serverless timeouts kill real-time audio). Contract is HTTP + Supabase rows.

---

## 2. Tenancy & data model philosophy

### 2.1 The tenant is `workspace`
- `auth.users` (Supabase-managed) ↔ `profiles` (1:1 public mirror, created by trigger on signup).
- A user belongs to one or more `workspaces` via `workspace_members` (role + granular permissions).
- **Every domain row carries `workspace_id uuid not null`** and is indexed on it (usually as the leading column of composite indexes).
- **RLS everywhere**: a row is visible iff the requesting user is a member of its workspace. Service-role (used by webhooks/cron/voice worker) bypasses RLS and must pass `workspace_id` explicitly.

### 2.2 Access pattern
```
request → middleware (verify Supabase JWT, resolve active workspace from cookie/header)
        → RSC/route handler gets supabase client bound to the user's JWT
        → RLS auto-filters to workspaces the user belongs to
        → for cross-tenant/system work (webhook, cron, voice callback) use createAdminClient()
          and ALWAYS scope queries by workspace_id derived from the channel/resource.
```

### 2.3 Roles & permissions (from screen 11)
- Roles: `owner`, `admin`, `manager`, `agent` (+ future custom roles).
- Granular permission flags stored on `workspace_members.permissions jsonb` (Inbox, Contacts, Campaigns, Workflows, Voice, Billing, Team, Settings, Integrations…) mirroring the permission matrix in the mockup.
- Per-agent monthly **credit limit** (`workspace_members.credit_limit`) enforced by the credits service.
- RLS uses a `SECURITY DEFINER` helper `auth_has_permission(workspace_id, 'billing.read')` for feature-level gating; coarse "is member" for row visibility.

---

## 3. Authentication & onboarding

### 3.1 Providers (Supabase Auth)
- **Social (primary): Google** ("continue with Gmail"), plus GitHub / Microsoft / Facebook as configured OAuth providers in Supabase.
- **Email**: magic link **or** email+password. Business-email signup path collects company info after first login.
- MFA/TOTP available via Supabase (screen 12 "2FA setup" → `input-otp`).

### 3.2 Signup → onboarding flow (maps to screen 14)
```
1. Landing → "Continue with Google" / "Sign up with email"
2. Supabase creates auth.users row
   └─ trigger handle_new_user() inserts profiles(id, email, full_name, avatar_url)
3. First login → app checks profiles.onboarding_completed
   ├─ if false → /onboarding wizard:
   │    Step 1 Welcome  → collect company name → CREATE workspace + workspace_member(owner)
   │                      + seed default pipeline/stages, credit_wallet (trial credits),
   │                      workspace_settings, default chatbot/voice agent rows
   │    Step 2 Connect WhatsApp → Meta embedded signup OR manual BYOK creds → channel_connections
   │    Step 3 Import Contacts  → CSV / Google Sheet / manual → contacts
   │    Step 4 First Workflow   → pick template → workflows row (from template library)
   │    Step 5 Go Live          → mark onboarding_completed = true
   └─ if true → /dashboard
```
- **Email collected**: `profiles.email` (auth), plus during onboarding `full_name`, `company/workspace name`, role, timezone, phone (optional), industry (optional). All non-auth profile info lives in `profiles` + `workspaces`.
- Invited teammates skip workspace creation: an `invitation` row (token) → on accept, `workspace_member` is created with the invited role; they only fill personal profile.

### 3.3 Session
- Supabase cookie-based session (already wired in `middleware.ts` + `lib/supabase/{server,client}.ts`). Extend middleware to also resolve/persist the **active workspace** (cookie `fw_ws`) and redirect to `/onboarding` when incomplete.

---

## 4. Domain services (Next.js `src/services`)

| Service | Status | Responsibility |
|---|---|---|
| `meta.ts` | reuse + tenant | WhatsApp send (text/template/media); resolve creds per-workspace from `channel_connections` instead of the single `chatbot_settings` row |
| `ai.ts` | reuse + tenant | Chatbot generation (Gemini→Groq), function-calling tools, history pruning; scope to `chatbot_id`/workspace; **debit credits** on each generation |
| `gemini-cache.ts` | reuse | Prompt context caching per chatbot |
| `mailer.ts` | reuse + tenant | SMTP send + template compile; creds from `channel_connections` |
| `livekit.ts` | reuse | SIP dial + egress recording (hands off to Railway worker) |
| `vapi.ts` | keep (optional) | Alternate Vapi path; Sarvam/LiveKit is primary |
| `lead-capture.ts` | change | Google-Sheet ingest → move locks/loop to **QStash** queue; scope per workspace |
| `scheduler.ts` | change | Campaign scheduling → QStash schedules instead of in-process |
| **`credits.ts`** | **new** | Reserve/commit/refund credits atomically; wallet + ledger; per-agent limits |
| **`workflow-engine.ts`** | **new** | Execute persisted graphs; step runner; delays via QStash; run logs |
| **`inbox.ts`** | **new** | Conversation threading, assignment, tags, notes, presence, canned replies |
| **`knowledge.ts`** | **new** | Ingest docs → chunk → embed (pgvector) → retrieve; build Graph-RAG nodes/edges |
| **`voice.ts`** | **new (thin)** | Create/manage voice agents + **cloned voices**; issue dispatch tokens to Railway worker; reconcile call state |
| **`billing.ts`** | **new** | Stripe subscriptions, plans, invoices, credit top-ups (webhook-driven) |
| **`integrations.ts`** | **new** | OAuth connect (Google Sheets/Slack/HubSpot…), token storage/refresh, outbound webhooks, API keys |
| **`notifications.ts`** | **new** | Create notification rows + Realtime push; email/web-push fan-out |
| **`audit.ts`** | **new** | Append audit_log rows for sensitive actions |

**Service conventions**
- Every service function takes an explicit `workspaceId` (never inferred from a global singleton).
- Side-effecting external calls (Meta, SMTP, LiveKit, Stripe) are **idempotent** (dedupe key) and **credit-metered** where billable.
- Long/fan-out work is **enqueued**, not run inline in the request.

---

## 5. Async, queues & scheduling

Replace the current in-memory `isSyncing`/`isProcessingLeads` guards (unsafe across >1 instance) with durable queues.

| Job | Mechanism | Notes |
|---|---|---|
| Campaign send fan-out | QStash → `/api/jobs/campaign-batch` | Batches of N with rate-limit against Meta tier; per-recipient `campaign_recipients` row |
| Workflow delay/step | QStash delayed publish → `/api/jobs/workflow-step` | Durable timers replace `setTimeout` |
| Lead-capture Sheet sync | QStash cron → `/api/jobs/lead-sync` | Idempotent via `row_hash` (already present) |
| Scheduled campaigns | QStash schedule / `pg_cron` | Fire at `scheduled_at` |
| Voice call reconcile / cleanup | `pg_cron` + `/api/voice/cleanup` (exists) | Sweep stuck "ringing/in-progress" |
| Knowledge doc ingest/embed | QStash → `/api/jobs/embed` | Chunk + embed in background |
| Credit low / usage alerts | `pg_cron` | Emit notifications |

**Idempotency & concurrency**: use Postgres row locks (`... where status='pending' for update skip locked`) for claim-based workers, and Redis `SET NX` short locks for cron singletons.

---

## 6. Realtime

- **Supabase Realtime** (Postgres logical replication) already enabled for `messages/contacts/campaigns`. Extend the publication to `conversations`, `notifications`, `voice_calls`, `workflow_runs`, `credit_wallets`.
- Client subscribes filtered by `workspace_id` (RLS applies to Realtime too).
- **Presence & typing indicators** (agents online, "typing…") → Supabase Realtime Presence channel per conversation, or Upstash-backed. The frontend spec lists `socket.io-client`; with Supabase we prefer **Supabase Realtime channels** to avoid running a separate socket server. (socket.io only if a dedicated gateway is later needed.)
- **AI streaming** (token-by-token chatbot/preview) → SSE via `@microsoft/fetch-event-source` from a route handler.

---

## 7. Storage (Supabase Storage buckets)

| Bucket | Contents | Access |
|---|---|---|
| `media` | WhatsApp inbound/outbound media, chat attachments | signed URLs, workspace-scoped path `ws/{id}/...` |
| `recordings` | Voice call recordings (egress) | private, signed URLs |
| `voice-samples` | **Voice-cloning source audio + generated previews** | private |
| `knowledge` | Uploaded docs (PDF/CSV/DOCX) for RAG | private |
| `avatars` / `logos` | Profile + workspace branding, email logos | public-read |
| `exports` | Generated CSV/Excel/PDF reports | signed, short TTL |

Storage RLS policies mirror table RLS: path prefix `ws/{workspace_id}/` + membership check.

---

## 8. Voice agent integration (Railway) + Voice Cloning

The Railway worker is unchanged in spirit; the web app owns config & records.

### 8.1 Call lifecycle
```
Web/app or workflow → services/voice.ts.dial()
  → insert voice_calls(status='queued', workspace_id, agent config snapshot, voice_id/cloned_voice_id)
  → livekit.dialSip() creates room + SIP call, issues dispatch metadata (system prompt, voice, KB handle)
  → Railway worker joins room, runs Sarvam/Gemini pipeline, starts egress recording
  → worker posts status to /api/voice/webhook  → update voice_calls (ringing→in-progress→completed)
  → transcript posted to /api/voice/transcript → voice_transcripts rows
  → recording finalized → recordings bucket + voice_calls.recording_url
  → credits debited by call duration (services/credits.ts)
```

### 8.2 Voice cloning (new)
```
User uploads sample audio (voice-samples bucket)
  → insert cloned_voices(workspace_id, status='processing', sample_url)
  → services/voice.ts posts a clone job to the Railway worker (POST /clone)  [or Sarvam/ElevenLabs clone API]
  → worker trains/registers the voice → callback /api/voice/clone-webhook
  → cloned_voices.status='ready', provider_voice_id set, preview_url generated
  → cloned voice becomes selectable in voice_agents.voice_id (alongside built-in Sarvam/Gemini voices)
```
- **Reuse the OLD voice-agent UI** (`/dashboard/voice-agent/*`, `/dashboard/voice/page.tsx`, `voices/page.tsx`, `calls/page.tsx`, `lib/voices.ts`) — do **not** adopt the new mockup voice screens. Extend the old UI only with a "Clone a voice" upload panel that writes to `cloned_voices`.
- Built-in voices stay in `lib/voices.ts` (Sarvam + Gemini); cloned voices are appended from the `cloned_voices` table at runtime.

### 8.3 Contract (web ↔ Railway)
- **Web → worker**: dispatch metadata on the LiveKit room (agent type, voice id or cloned provider id, system prompt, workspace_id, KB retrieval endpoint + token). Optional `POST /clone` for cloning.
- **Worker → web**: `POST /api/voice/webhook` (status), `/api/voice/transcript`, `/api/voice/clone-webhook`, `/api/voice/recording` — all authenticated with a shared `VOICE_WORKER_SECRET`, all carry `workspace_id`.

---

## 9. Credits & billing (new)

- **`plans`** (Free/Pro/Business…) define monthly credit grants + feature caps.
- **`subscriptions`** link workspace → plan (Stripe). Stripe webhooks drive state.
- **`credit_wallets`** hold current balance per workspace (fast read, cached in Redis).
- **`credit_ledger`** append-only transactions (grant, debit, refund, top-up) — the source of truth; wallet is a materialized balance kept in sync by a trigger/RPC.
- **Metering**: chatbot msg, voice minute (~15 cr/min per mockup), campaign message, workflow AI node all call `credits.reserve()` → `commit()`/`refund()`. Per-agent limits from `workspace_members.credit_limit`.
- **Invoices** table for PDF generation (frontend `@react-pdf/renderer`).

---

## 10. Knowledge Hub / Graph RAG (new)

- `knowledge_bases` (per workspace, optionally linked to a chatbot/voice agent).
- `knowledge_documents` (source: upload/url/sheet/site) → `knowledge_chunks(embedding vector(768/1536))` using **pgvector** (`text-embedding` via Gemini/OpenAI).
- Retrieval: `match_chunks(kb_id, query_embedding, k)` RPC (cosine, ivfflat/hnsw index) feeds chatbot/voice system context.
- **Graph RAG view**: `kg_nodes` / `kg_edges` (entities + relations extracted during ingest) → rendered with React Flow on screen 09.

---

## 11. Security

- **RLS on 100% of tenant tables** (deny by default; policies grant via membership + permission helpers).
- Secrets (Meta tokens, SMTP passwords, Stripe, OAuth refresh tokens, API keys) stored **encrypted at rest** — use Supabase Vault or `pgcrypto` (`pgp_sym_encrypt`) with `ENCRYPTION_KEY`; never return raw secrets to the client (mask in API).
- API keys for the public API: store only a **hash** (`api_keys.key_hash`), show plaintext once at creation.
- Webhook auth: Meta signature verification, Stripe signature, `VOICE_WORKER_SECRET`, QStash signature.
- Rate limiting (Upstash) on auth, public API, AI endpoints, campaign triggers.
- Audit log for role changes, billing, credential edits, exports, deletes.
- Input validation with **Zod** at every route boundary; sanitize user HTML (`dompurify`) before storing/rendering rich text.

---

## 12. Scalability & performance

| Concern | Approach |
|---|---|
| Stateless compute | Next.js route handlers are stateless → scale horizontally; no in-memory locks |
| DB read scale | RLS-friendly composite indexes led by `workspace_id`; heavy read pages use RSC + Supabase read replicas (later); `@tanstack/react-query` client caching |
| Large lists (100k+ contacts/messages) | keyset pagination (`created_at,id` cursor), `@tanstack/react-virtual` on client, `pg_trgm` search (already used), optional Typesense for global search |
| Hot settings reads | cache `chatbot/voice/workspace settings` + credit balance in Upstash (TTL + explicit invalidation on write) |
| Write spikes (campaigns) | QStash fan-out + Meta tier-aware rate limiting; `campaign_recipients` batched inserts |
| Realtime cost | subscribe with column filters; avoid broad table subscriptions |
| Media/recordings | Supabase Storage + CDN signed URLs; never stream through Next.js |
| Voice concurrency | Railway worker autoscales on active rooms; web only holds lightweight records |
| Cold latency | RSC for first paint; edge middleware for auth redirects; brotli/gzip (frontend) |

**Latency budget**: inbox send < 300ms server; dashboard TTFB < 500ms (cached aggregates in a `dashboard_daily_metrics` rollup table refreshed by cron, instead of live COUNT(*) scans).

---

## 13. Directory changes (Next.js `src/`)

```
src/
  app/
    (auth)/login, signup, callback           # social + email
    onboarding/                               # 5-step wizard (exists → wire to workspace create)
    dashboard/
      inbox/ contacts/ leads/ campaigns/
      workflows/ chatbot/ voice-agent/*  (KEEP OLD)  knowledge/ analytics/
      team/ billing/ integrations/ settings/
    api/
      contacts messages chats campaigns templates analytics   # exists → add tenancy
      inbox/{assign,tags,notes,canned}                        # new
      workflows/{[id],run} jobs/{campaign-batch,workflow-step,lead-sync,embed}  # new
      chatbot voice/*  (KEEP)                                 # add tenancy
      knowledge/{docs,search,graph}                           # new
      credits billing/{webhook,checkout} integrations/* api-keys webhooks  # new
      voice/{clone,clone-webhook}                             # new (cloning)
      webhook (Meta) auth/*                                   # exists
  services/                                   # see §4
  lib/
    supabase/{server,client}                  # exists → add tenant helper
    redis.ts qstash.ts stripe.ts crypto.ts    # new
    voices.ts                                 # KEEP (built-in voices)
  db/  migrations/*.sql                        # versioned migrations (see 02_DB_SCHEMA.sql)
```

---

## 14. Build phases (dependency order)

1. **Tenancy foundation** — workspaces, profiles, members, invitations, RLS helpers, auth triggers, onboarding wiring, `workspace_id` migration + backfill on existing tables.
2. **Inbox v2** — conversations threading, assignment/tags/notes/canned replies, presence, Realtime.
3. **CRM** — pipelines/stages/leads (kanban), contact enrichment (owner, score, custom fields), activities.
4. **Credits & Billing** — wallet/ledger/plans/subscriptions/Stripe; wire metering into ai/voice/campaigns.
5. **Workflows** — persistence + engine + QStash timers + run logs.
6. **Knowledge/RAG** — pgvector ingest/retrieve + Graph RAG.
7. **Integrations/API/Webhooks/Notifications/Audit**.
8. **Voice cloning** — `cloned_voices` + Railway `/clone` contract, extend OLD voice UI.
9. **Hardening** — caching, rollups, rate limits, load tests.

Each phase ships behind the same schema file (`02_DB_SCHEMA.sql`), applied as ordered migrations.
