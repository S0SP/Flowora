# Flowora — Complete Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────┐     ┌──────────────────────────────┐
│  Vercel (Next.js 15 App)            │     │  Railway (Voice Worker)       │
│  - Dashboard UI                     │◄───►│  - Python 3.11               │
│  - 44 API routes                    │     │  - LiveKit Agent SDK          │
│  - WhatsApp webhook                 │     │  - DeepGram STT               │
│  - Chatbot AI (Gemini)              │     │  - Sarvam TTS                 │
│  - Campaign/workflow engine         │     │  - VoiceLink SIP Trunk        │
└──────────────┬──────────────────────┘     └──────────────────────────────┘
               │
     ┌─────────┼──────────────────────┐
     ▼         ▼                      ▼
┌─────────┐ ┌──────────────┐ ┌───────────────┐
│Supabase │ │ Upstash      │ │  Meta WhatsApp│
│Postgres │ │ Redis+QStash │ │  API v18.0    │
│Auth+RLS │ └──────────────┘ └───────────────┘
└─────────┘
```

---

## Step 1 — Accounts to Create

| Service | Free Tier | Purpose |
|---------|-----------|---------|
| [Supabase](https://supabase.com) | 500 MB DB, 2 projects | Database + Auth |
| [Vercel](https://vercel.com) | Hobby (free) | Next.js hosting |
| [Railway](https://railway.app) | $5/mo credit | Voice worker container |
| [Upstash](https://upstash.com) | 10k QStash msgs/day | Job queue + Redis cache |
| [LiveKit Cloud](https://livekit.io) | Pay-per-use | SIP telephony + WebRTC |
| [VoiceLink](https://voicelink.io) | Varies | SIP trunk (phone numbers) |
| [Sarvam AI](https://www.sarvam.ai) | Paid | Indian-language TTS |
| [DeepGram](https://deepgram.com) | $200 free credit | STT (speech recognition) |
| [Groq](https://groq.com) | Free tier | LLM for voice agent |
| [Google AI Studio](https://aistudio.google.com) | Free tier | Gemini LLM + embeddings |
| [Meta Developer](https://developers.facebook.com) | Free | WhatsApp Business API |
| [cron-job.org](https://cron-job.org) | Free | Minute-level cron jobs |
| Stripe or Razorpay | - | Billing (optional) |

---

## Step 2 — Supabase Setup

### 2a. Create project
1. Create a new Supabase project (note your project URL and keys)
2. Go to **Settings → API** — copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 2b. Run migrations (in order)
Open the Supabase SQL Editor and run each file in order:

```sql
-- Run these in Supabase SQL Editor:
-- 1. database/migrations/001_multi_tenant.sql
-- 2. database/migrations/002_tickets.sql
-- Then run all other files in database/migrations/ and database/*.sql
```

Run in this order:
1. `database/migrations/001_multi_tenant.sql` — workspace foundation, RLS
2. `database/migrations/002_tickets.sql` — ticket system
3. `database/migration-chatbot-groq.sql` — chatbot settings
4. `database/migration-chatbot-caching.sql` — prompt cache
5. `database/migration-knowledge-base.sql` — RAG knowledge base
6. `database/migration-scheduler.sql` — campaign scheduling
7. `database/migration-lead-capture-multi-workflow.sql` — lead capture
8. `database/migration-inbox-routing.sql` — inbox routing
9. `database/migration-voice-settings.sql` — voice call tracking
10. `database/migration-ai-agents.sql` — AI agent config
11. `database/migration-email-settings.sql` — email settings
12. `database/voice_calls.sql` — voice call records
13. `database/voice_calls_add_cost.sql` — call cost tracking

### 2c. Enable Supabase Realtime
Go to **Database → Replication** and enable realtime on:
- `messages`
- `threads`
- `tickets`
- `ticket_tags`

### 2d. Storage bucket for call recordings
1. Go to **Storage** → Create bucket named `call-recordings`
2. Set it to **Private** (accessed via service role only)
3. Copy the S3 endpoint details from **Settings → Storage**:
   - `SUPABASE_S3_ACCESS_KEY`
   - `SUPABASE_S3_SECRET`
   - `SUPABASE_S3_REGION`
   - `SUPABASE_S3_ENDPOINT`

### 2e. Auth settings
1. Go to **Authentication → URL Configuration**
2. Add your Vercel app URL to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`
3. Enable **Email** provider (for team invitations)

---

## Step 3 — WhatsApp Business API (Meta)

1. Go to [Meta Business Suite](https://business.facebook.com)
2. Create a **WhatsApp Business Account (WABA)**
3. In **Meta Developers**, create an app → add **WhatsApp** product
4. Under **WhatsApp → API Setup**:
   - Copy `Phone Number ID` → `META_PHONE_NUMBER_ID`
   - Copy `WABA ID` → `META_WABA_ID`
   - Generate a **Permanent Access Token** → `META_ACCESS_TOKEN`
5. Under **Webhooks**, configure:
   - Webhook URL: `https://your-app.vercel.app/api/webhooks/whatsapp`
   - Verify Token: set a random string → `META_VERIFY_TOKEN`
   - Subscribe to: `messages`, `message_status_updates`

> **Note:** WhatsApp credentials can also be stored per-workspace in the app via **Settings → Integrations** (BYOK). The env vars above are the global fallback.

---

## Step 4 — LiveKit Cloud

1. Create a project at [cloud.livekit.io](https://cloud.livekit.io)
2. Copy from **Settings → Keys**:
   - Project URL (WebSocket) → `LIVEKIT_URL`
   - API Key → `LIVEKIT_API_KEY`
   - API Secret → `LIVEKIT_API_SECRET`
3. Under **SIP → Trunks**, create an outbound SIP trunk:
   - Point it to your VoiceLink SIP domain
   - Copy the Trunk SID → `LIVEKIT_SIP_TRUNK_ID`

---

## Step 5 — VoiceLink SIP Trunk

1. Sign up at VoiceLink and provision a SIP trunk
2. Get your SIP credentials:
   - `VOICELINK_SIP_DOMAIN`
   - `VOICELINK_SIP_USERNAME`
   - `VOICELINK_SIP_PASSWORD`
   - `VOICELINK_SIP_OUTBOUND_NUMBER` (your DID/phone number)
   - `VOICELINK_SIP_TRUNK_ID` (from LiveKit after linking the trunk)
   - `VOICELINK_SIP_TECH_PREFIX` (default: `45454`)
3. Configure the SIP trunk to point inbound calls to your LiveKit SIP URI

---

## Step 6 — AI Services

### DeepGram (Speech-to-Text)
1. Sign up at [console.deepgram.com](https://console.deepgram.com)
2. Create an API key → `DEEPGRAM_API_KEY`
3. Model used: `nova-2` with `language=multi` (auto-detects language)

### Sarvam AI (Text-to-Speech)
1. Sign up at [sarvam.ai](https://www.sarvam.ai)
2. Get API key → `SARVAM_API_KEY`
3. Available voices: 44+ including Hindi, Tamil, Telugu, Bengali, etc.
4. Models: `bulbul:v2` (7 voices), `bulbul:v3-beta` (15+ voices)

### Groq (LLM for Voice Agent)
1. Sign up at [console.groq.com](https://console.groq.com)
2. Create an API key → `GROQ_API_KEY`
3. Default model: `llama-3.1-8b-instant` (lowest latency for voice)

### Google Gemini (Chatbot LLM + Embeddings)
1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create an API key → `GEMINI_API_KEY` and `EMBEDDING_API_KEY`
3. Used for: WhatsApp chatbot responses, RAG embeddings

---

## Step 7 — Upstash (Redis + QStash)

1. Create an account at [upstash.com](https://upstash.com)

### Redis (hot cache)
1. Create a **Redis** database (Global, Frankfurt recommended)
2. Copy REST credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### QStash (job queue)
1. Go to **QStash** tab
2. Copy credentials:
   - `QSTASH_TOKEN`
   - `QSTASH_CURRENT_SIGNING_KEY`
   - `QSTASH_NEXT_SIGNING_KEY`

> QStash is used for: campaign fan-out, workflow step delays, knowledge base embedding, lead sync.

---

## Step 8 — Vercel Deployment (Next.js)

### 8a. Deploy
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo at [vercel.com/new](https://vercel.com/new).

### 8b. Environment Variables
Add all variables from `.env.example` in **Vercel → Project → Settings → Environment Variables**:

```
# Required - Core
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
ENCRYPTION_KEY              # openssl rand -hex 32

# Required - WhatsApp
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_WABA_ID
META_VERIFY_TOKEN
CRON_SECRET                 # random secret for cron auth

# Required - AI
GEMINI_API_KEY
EMBEDDING_API_KEY
GROQ_API_KEY

# Required - Queue
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY

# Required - Voice
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
RAILWAY_VOICE_WORKER_URL    # set after voice worker is deployed
VOICE_WORKER_SECRET

# Optional - Billing
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_BUSINESS_MONTHLY
STRIPE_PRICE_CREDIT_1000
STRIPE_PRICE_CREDIT_5000
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
NEXT_PUBLIC_RAZORPAY_KEY_ID

# Optional
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
DEEPGRAM_API_KEY            # Also set in voice-worker
SARVAM_API_KEY              # Also set in voice-worker
```

### 8c. Webhooks to register after deploy
- **WhatsApp:** `https://your-app.vercel.app/api/webhooks/whatsapp`
- **Stripe:** `https://your-app.vercel.app/api/webhooks/stripe`
- **LiveKit:** `https://your-app.vercel.app/api/voice/webhook`
- **Transcript callback:** `https://your-app.vercel.app/api/voice/transcript`

---

## Step 9 — Cron Jobs (FREE alternative to Vercel Pro)

Vercel Hobby plan does **NOT** support per-minute cron jobs. Use [cron-job.org](https://cron-job.org) (free).

### Setup on cron-job.org
Create 3 cron jobs, all with `*/1 * * * *` (every minute):

| Job | URL | Auth Header |
|-----|-----|-------------|
| Campaign processor | `https://your-app.vercel.app/api/cron/process-schedules` | `Authorization: Bearer YOUR_CRON_SECRET` |
| Google Sheets poll | `https://your-app.vercel.app/api/cron/poll-sheets` | `Authorization: Bearer YOUR_CRON_SECRET` |
| Reminders sender | `https://your-app.vercel.app/api/cron/send-reminders` | `Authorization: Bearer YOUR_CRON_SECRET` |

For each job in cron-job.org:
1. Set **HTTP Method** to `GET`
2. Add request header: `Authorization: Bearer YOUR_CRON_SECRET`
3. Set schedule: **Every minute**
4. Enable **Failure notifications**

> If you upgrade to **Vercel Pro ($20/mo)**, you can use `vercel.json` crons instead. Re-add them to `vercel.json` with `"schedule": "* * * * *"`.

---

## Step 10 — Voice Worker (Railway)

### 10a. Deploy on Railway
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the repo and set the **root directory** to `/voice-worker`
3. Railway will detect the `Dockerfile` automatically

### 10b. Voice Worker Environment Variables
In Railway, set these under **Variables**:

```bash
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret

# AI
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
SARVAM_API_KEY=your_sarvam_key
GEMINI_API_KEY=your_gemini_key

# LLM config
LLM_PROVIDER=groq
GROQ_MODEL=llama-3.1-8b-instant
GROQ_TEMPERATURE=0.7

# TTS config
TTS_PROVIDER=sarvam
SARVAM_VOICE=anushka
SARVAM_LANGUAGE=en-IN
SARVAM_MODEL=bulbul:v2

# STT config
STT_LANGUAGE=multi

# VoiceLink SIP Trunk
VOICELINK_SIP_DOMAIN=your.voicelink.domain
VOICELINK_SIP_USERNAME=your_username
VOICELINK_SIP_PASSWORD=your_password
VOICELINK_SIP_OUTBOUND_NUMBER=+91XXXXXXXXXX
VOICELINK_SIP_TRUNK_ID=ST_xxxx
VOICELINK_SIP_TECH_PREFIX=45454
DEFAULT_TRANSFER_NUMBER=+91XXXXXXXXXX

# CRITICAL: Set this after Vercel deploy
WEBHOOK_URL=https://your-app.vercel.app/api/voice/transcript

# Supabase (for BYOK dynamic config)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

PORT=8080
```

### 10c. After Railway deploy
1. Copy the Railway public URL (e.g., `https://voice-worker-production-xxxx.railway.app`)
2. Set in Vercel: `RAILWAY_VOICE_WORKER_URL=https://voice-worker-production-xxxx.railway.app`

### 10d. Voice worker health check
```bash
curl https://your-voice-worker.railway.app/health
# Expected: {"status": "ok"}
```

---

## Step 11 — Google OAuth (for Sheets integration)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Sheets API** and **Google Drive API**
3. Go to **APIs & Services → Credentials**
4. Create **OAuth 2.0 Client ID** (Web application type)
5. Add Authorized redirect URI: `https://your-app.vercel.app/api/auth/google/callback`
6. Copy:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`

---

## Step 12 — Billing (Optional)

### Stripe
1. Create account at [stripe.com](https://stripe.com)
2. Create products with monthly prices in Stripe Dashboard
3. Copy price IDs to env vars
4. Register webhook at `https://your-app.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
5. Copy `STRIPE_WEBHOOK_SECRET`

### Razorpay (for INR billing)
1. Create account at [razorpay.com](https://razorpay.com)
2. Copy API keys and webhook secret
3. Register webhook at `https://your-app.vercel.app/api/webhooks/razorpay`

---

## Step 13 — First Login & Workspace Setup

1. Visit `https://your-app.vercel.app/auth/signup`
2. Create your account
3. Complete onboarding (create workspace, name, etc.)
4. Go to **Settings → Integrations** to configure BYOK credentials:
   - WhatsApp (Meta API credentials per workspace)
   - LiveKit credentials
   - AI API keys override
5. Go to **Settings → Voice Agent** to configure SIP trunk settings

---

## Step 14 — Ticket System Post-Deployment

The ticket system (from migration `002_tickets.sql`) is ready after the database migration.

### How tickets work:
1. **AI escalation**: When the WhatsApp chatbot can't help, it creates a ticket and pauses AI for that thread
2. **Manual creation**: Go to **Contacts** → select a contact → create ticket
3. **Agent workflow**: Open **Tickets** in the sidebar → assign, reply, resolve
4. **AI resumes**: When a ticket is resolved/closed, AI automatically resumes for that thread

### Thread → Ticket flow:
```
Inbound WhatsApp message
    → Thread created (ai_active=true)
    → AI replies
    → [escalation trigger]
    → Ticket created, thread.ai_active=false
    → Agent handles in /dashboard/tickets
    → Ticket resolved → thread.ai_active=true
    → AI resumes
```

---

## Step 15 — Post-Deployment Checklist

### Database
- [ ] All SQL migrations run (001 through 002 + all others)
- [ ] Realtime enabled on: `messages`, `threads`, `tickets`, `ticket_tags`
- [ ] Storage bucket `call-recordings` created
- [ ] Auth redirect URLs configured

### Vercel
- [ ] All env vars set (see Step 8b)
- [ ] Production URL confirmed: `NEXT_PUBLIC_APP_URL`
- [ ] WhatsApp webhook verified (green checkmark in Meta)
- [ ] Stripe webhook configured with correct secret
- [ ] LiveKit webhook registered

### Cron Jobs (cron-job.org)
- [ ] 3 jobs created and running every minute
- [ ] CRON_SECRET set in Vercel and cron-job.org headers

### Voice Worker
- [ ] Deployed on Railway
- [ ] All env vars set including `WEBHOOK_URL`
- [ ] `RAILWAY_VOICE_WORKER_URL` set in Vercel
- [ ] Health check passing

### In-App (after login)
- [ ] Workspace created
- [ ] WhatsApp credentials added in Settings → Integrations
- [ ] LiveKit credentials added (or using global env vars)
- [ ] AI chatbot enabled for at least one channel
- [ ] Test WhatsApp message sent/received

---

## Troubleshooting

### WhatsApp messages not received
- Check Meta webhook shows green (verified)
- Check `META_VERIFY_TOKEN` matches what's in Meta dashboard
- Check Supabase logs for insert errors in `messages` table

### Voice calls not connecting
- Verify `LIVEKIT_URL` is WebSocket (`wss://`)
- Check Railway logs: `railway logs --tail`
- Verify `WEBHOOK_URL` in voice worker env points to Vercel
- Check VoiceLink SIP trunk has correct LiveKit SIP URI

### Cron jobs not running
- Verify cron-job.org shows success (200) for each job
- Check `CRON_SECRET` header matches Vercel env var
- Check Supabase `campaign_schedules` table for `status='scheduled'` rows

### Tickets not showing AI escalation
- Ticket creation happens in the WhatsApp webhook handler
- Check `src/app/api/webhooks/whatsapp/route.ts` for escalation logic
- Verify `002_tickets.sql` migration ran successfully

### Database connection issues
- Use `SUPABASE_SERVICE_ROLE_KEY` (not anon key) for server-side operations
- Check Vercel function logs: `vercel logs --prod`

---

## Cost Estimates (per month, moderate usage)

| Service | Free Tier | ~100 customers |
|---------|-----------|----------------|
| Vercel Hobby | Free | Free |
| Supabase | Free (500 MB) | Free |
| Railway Voice Worker | $5 credit | ~$5 |
| Upstash Redis + QStash | Free (10k msgs/day) | Free |
| LiveKit | Pay-per-use | ~$10 (voice minutes) |
| DeepGram STT | $200 credit | ~₹36/hr voice |
| Sarvam TTS | Paid | ~₹0.80/1000 chars |
| Groq LLM | Free tier | Free |
| Gemini AI | Free tier | Free |
| cron-job.org | Free | Free |
| **Total** | | **~$15–25/mo** |
