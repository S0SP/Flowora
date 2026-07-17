# Flowra + Dograh: Operations, Auth Fixes & Railway Deployment Guide

---

## Part 1 — Running Everything Locally

### 1A. Flowra (Next.js Frontend)

Create `d:\wa\Flowra\.env.local`:

```env
# ── Supabase ──────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# ── App URL (used in email links, callbacks) ──────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Dograh backend (your self-hosted instance) ────────────────
DOGRAH_API_URL=http://localhost:8000
DOGRAH_API_SECRET=change-me-in-production

# ── Google AI (RAG embedding + Gemini chatbot) ────────────────
GEMINI_API_KEY=AIza...

# ── Meta / WhatsApp (optional for local dev) ─────────────────
META_ACCESS_TOKEN=EAA...
META_PHONE_NUMBER_ID=1234567890
META_VERIFY_TOKEN=flowora_webhook_verify

# ── LiveKit (only if you still need voice rooms) ──────────────
# These are optional now that Dograh handles calls
LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
LIVEKIT_API_KEY=APIxxx
LIVEKIT_API_SECRET=xxxsecret
LIVEKIT_API_URL=https://your-livekit-project.livekit.cloud
```

**Start the frontend:**
```bash
cd d:\wa\Flowra
npm install
npm run dev          # → http://localhost:3000
```

---

### 1B. Dograh Backend (Python / FastAPI)

Create `d:\wa\dograh\.env`:

```env
# ── Database ──────────────────────────────────────────────────
# Dograh uses its own SQLite by default. For production, point to Postgres:
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# ── Dograh internal secret (must match DOGRAH_API_SECRET in Flowra) ──
FLOWRA_SECRET=change-me-in-production

# ── AI Provider keys (one or more) ────────────────────────────
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...

# ── VoiceLink telephony ───────────────────────────────────────
# These are added per-client in the Dograh admin panel, NOT here.
# The keys below are fallback defaults only:
VOICELINK_API_KEY=<your-voicelink-key>
VOICELINK_API_SECRET=<your-voicelink-secret>

# ── Sarvam TTS (if using Sarvam voices) ──────────────────────
SARVAM_API_KEY=<your-sarvam-key>

# ── Flowra remote RAG endpoint ────────────────────────────────
FLOWRA_API_URL=http://localhost:3000
```

**Start Dograh backend:**
```bash
cd d:\wa\dograh
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000
# → Dograh admin UI at http://localhost:8000/admin
```

**Start Dograh with Docker (alternative):**
```bash
cd d:\wa\dograh
docker compose up --build
```

---

## Part 2 — Auth Bugs: Diagnosis & Fixes

### Bug 1 — Signup with Email/Password: User stuck in "check-email" loop after verification

**Root cause:** The auth flow is:
1. User signs up → Supabase sends verification email → `emailRedirectTo: /auth/callback`
2. User clicks email link → `/auth/callback?code=xxx` → `exchangeCodeForSession` → redirects to `/dashboard`
3. Middleware sees `onboarding_completed = false` in `profiles` table → **redirects to `/onboarding`** ✅

**But there are TWO bugs hiding here:**

**Bug 1a — Profile row doesn't exist yet when middleware reads it**

After email verification the user hits `/dashboard`. The middleware reads `profiles` table at line 73 of [middleware.ts](file:///d:/wa/Flowra/src/middleware.ts). But the `profiles` row is only created **when `POST /api/workspaces` is called** (line 35 of [route.ts](file:///d:/wa/Flowra/src/app/api/workspaces/route.ts)). So if the user verifies their email and the profile doesn't exist yet, `profile` is `null` → `onboarding_completed` is `undefined` → treated as `false` → redirect to `/onboarding` → this is actually fine BUT...

**Bug 1b — `/onboarding` is not in `PUBLIC_PATHS`, causing an infinite redirect for unverified users**

In [middleware.ts](file:///d:/wa/Flowra/src/middleware.ts) line 52-59: if the user isn't authenticated and tries to reach `/onboarding`, they get redirected to `/auth/login`. If they ARE authenticated but hit the signup page, they get redirected to `/dashboard` (line 63-67). Both are correct. The real bug is the **signup flow's Step 2 workspace creation** is happening *before* the email is confirmed.

Looking at [signup/page.tsx](file:///d:/wa/Flowra/src/app/auth/signup/page.tsx) line 54-58:
```typescript
if (!data?.session) {
  setStep("check-email");   // ← user goes here when email confirm is required
} else {
  setStep("workspace");     // ← user goes here only if auto-confirmed
}
```

When `NEXT_PUBLIC_SUPABASE_URL` project has **"Email confirmation" enabled** in Supabase Auth settings, `data.session` is always `null` after signup → user always goes to `check-email` → they verify → they come back to `/auth/login` → they login → **they see `/onboarding`** correctly.

**The real issue**: After email verification, the callback redirects to `/dashboard`. But `/onboarding` creates the workspace, and the profile row is only created there. So the user lands on `/onboarding` with no workspace yet — which is correct! The onboarding page creates the workspace. 

**The actual breaking bug** is: In Supabase Auth settings, if you have **"Confirm email"** enabled and `emailRedirectTo` is `http://localhost:3000/auth/callback`, but the Supabase project's **Site URL** or **Redirect URLs** whitelist doesn't include `http://localhost:3000`, **the email link silently fails** and the user sees "Email link is invalid or has expired."

**Fix:**
1. Go to your Supabase project → **Authentication → URL Configuration**
2. Set **Site URL** to `http://localhost:3000` (dev) or your production URL
3. Add to **Redirect URLs**: `http://localhost:3000/auth/callback` and `https://yourdomain.com/auth/callback`
4. Go to **Authentication → Providers → Email** and ensure "Confirm email" is toggled correctly for your use case.

For **local dev only**, you can disable email confirmation entirely:
- Supabase Dashboard → Auth → Providers → Email → **Disable email confirmation** (auto-confirms users immediately, `data.session` will be populated, and they skip to Step 2 workspace creation directly).

---

### Bug 2 — Invite signup: New user trying to accept invite gets stuck in login redirect loop

**Root cause in [invite/[token]/page.tsx](file:///d:/wa/Flowra/src/app/invite/%5Btoken%5D/page.tsx):**

```typescript
const handleAccept = async () => {
  if (!user) {
    router.push(`/auth/login?redirect=/invite/${token}`)  // ← Bug here
    return
  }
```

The user is redirected to `/auth/login?redirect=/invite/${token}`. But the login page's `handleEmailLogin` at line 43:
```typescript
router.push("/dashboard")   // ← IGNORES the ?redirect param entirely!
```

The `redirect` query param is completely ignored by the login page. The user logs in and gets pushed straight to `/dashboard`, **losing the invite link**.

**Fix** — Update the login page to read the `redirect` query param and honor it after sign-in. Edit [login/page.tsx](file:///d:/wa/Flowra/src/app/auth/login/page.tsx):

```typescript
// Replace:
import { useRouter } from "next/navigation"

// With:
import { useRouter, useSearchParams } from "next/navigation"

// Then inside the component, add:
const searchParams = useSearchParams()
const redirectTo = searchParams.get("redirect") ?? "/dashboard"

// And in handleEmailLogin, change:
router.push("/dashboard")
// To:
router.push(redirectTo)

// And in handleGoogleLogin, change redirectTo option:
redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
```

Also update the auth callback ([route.ts](file:///d:/wa/Flowra/src/app/auth/callback/route.ts)) — it already reads `next` param correctly (line 8): `const next = requestUrl.searchParams.get("next") ?? "/dashboard"` ✅

**Additional invite fix**: The `/invite/[token]` route is not in `PUBLIC_PATHS` in middleware. This means an unauthenticated user visiting an invite link gets redirected to `/auth/login`, losing the invite context. The middleware redirect already preserves `next`:

```typescript
url.searchParams.set("next", pathname);  // line 58 in middleware.ts
```

But only if `/invite/` is not behind the auth wall. Since middleware sends them to `/auth/login?next=/invite/token`, and after login we redirect to `/dashboard` (bug above) — fixing the login page to honor `redirect`/`next` param fixes the whole chain.

---

### Applying the Auth Fix

```typescript
// src/app/auth/login/page.tsx  — add these changes:
"use client"

import { useState, Suspense } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"
// ... other imports

function LoginForm() {
  // ... existing state
  const router = useRouter()
  const searchParams = useSearchParams()
  // Use "redirect" or "next" — both may come from different places
  const redirectTo = searchParams.get("redirect") ?? searchParams.get("next") ?? "/dashboard"
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    })
    // ...
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      router.push(redirectTo)   // ← Honor the redirect param
    }
  }
  // ... rest of component
}

// Wrap in Suspense because useSearchParams requires it in Next.js 13+
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FAFAF8]" />}>
      <LoginForm />
    </Suspense>
  )
}
```

---

## Part 3 — Railway Deployment

### Yes, Railway is a great choice for your MVP.

Railway supports:
- **Next.js** (auto-detects, builds with Nixpacks)  
- **Python / FastAPI** (auto-detects via `requirements.txt`)  
- **Docker** (uses your `Dockerfile` or `docker-compose.yaml`)  
- **Persistent volumes** (for SQLite DB in Dograh if needed)  
- **Custom domains + automatic HTTPS**  
- **Private networking** between services in the same project  

---

### Railway Bottlenecks & Tradeoffs vs Other Providers

| Factor | Railway | Render | Fly.io | AWS/GCP/Azure |
|--------|---------|--------|--------|--------------|
| **Setup time** | ⭐ 5 min | 10 min | 15 min | Hours/days |
| **Cold starts** | Yes (Hobby plan sleeps) | Yes (free tier) | No (always-on possible) | No |
| **Persistent disk** | ✅ $0.25/GB/mo | ✅ | ✅ | ✅ (complex setup) |
| **WebSocket support** | ✅ | ✅ | ✅ | ✅ |
| **Private networking** | ✅ (same project) | ✅ (same account) | ✅ | ✅ VPC |
| **Region flexibility** | Limited (US/EU) | Limited | 30+ regions | Global |
| **Pricing predictability** | ⚠️ Usage-based, can spike | Flat tiers | Usage-based | Very complex |
| **Egress costs** | Low | Low | Higher | High |
| **Best for** | MVP/Startups | MVPs | Edge/low-latency | Enterprise |

**Railway-specific tradeoffs:**
- **Hobby plan ($5/mo)** — services sleep after inactivity. Your Dograh backend will have cold start latency (~3-5s) on first request. Upgrade to **Pro plan** to avoid this.
- **No GPU support** — if you move to local LLMs later, Railway won't work.
- **Build minutes** — 500 free minutes on Hobby, then $0.005/min. Large Next.js builds can eat this fast.
- **Database on Railway** — Railway offers Postgres add-on, but you're already on Supabase. Keep Supabase for DB, Railway just for compute.

---

### Railway Deployment Guide — Step by Step

#### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

#### Step 2: Create Railway Project

```bash
railway init
# Choose: "Create new project"
# Name: "flowra-production"
```

---

#### Step 3: Deploy Dograh Backend

```bash
cd d:\wa\dograh
railway link   # link this directory to your Railway project
```

Create `d:\wa\dograh\railway.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "uvicorn api.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Set environment variables on Railway:**
```bash
railway variables set \
  DATABASE_URL="postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres" \
  FLOWRA_SECRET="your-super-secret-key-change-this" \
  GEMINI_API_KEY="AIza..." \
  OPENAI_API_KEY="sk-..." \
  FLOWRA_API_URL="https://flowra.yourdomain.com" \
  SARVAM_API_KEY="..." \
  VOICELINK_API_KEY="..."
```

**Deploy:**
```bash
railway up --service dograh-backend
```

**Get your backend URL:**
```bash
railway domain
# → https://dograh-backend-production.up.railway.app
```

> Set this as a custom domain in Railway settings for a cleaner URL.

---

#### Step 4: Deploy Flowra (Next.js)

```bash
cd d:\wa\Flowra
railway link   # select the same project, create new service "flowra-frontend"
```

Railway auto-detects Next.js. Create `d:\wa\Flowra\railway.toml`:
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
healthcheckPath = "/"
healthcheckTimeout = 60
```

**Set environment variables:**
```bash
railway variables set \
  NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..." \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  NEXT_PUBLIC_APP_URL="https://flowra.yourdomain.com" \
  DOGRAH_API_URL="https://dograh-backend-production.up.railway.app" \
  DOGRAH_API_SECRET="your-super-secret-key-change-this" \
  GEMINI_API_KEY="AIza..." \
  META_ACCESS_TOKEN="EAA..." \
  META_PHONE_NUMBER_ID="1234567890" \
  META_VERIFY_TOKEN="flowora_webhook_verify"
```

**Deploy:**
```bash
railway up --service flowra-frontend
```

---

#### Step 5: Configure Supabase for Production

In Supabase Dashboard → **Authentication → URL Configuration**:
1. **Site URL**: `https://flowra.yourdomain.com`
2. **Redirect URLs**: Add `https://flowra.yourdomain.com/auth/callback`

In Supabase Dashboard → **API → CORS**: Add your Railway frontend URL.

---

#### Step 6: Connect Custom Domains (Optional)

In Railway dashboard:
- **flowra-frontend** service → Settings → Domains → Add `flowra.yourdomain.com`
- **dograh-backend** service → Settings → Domains → Add `api.yourdomain.com`

Add the CNAME records Railway gives you to your DNS provider.

---

#### Step 7: Enable Private Networking (Recommended)

In Railway, services within the same project get a private network. Instead of going over the public internet, Flowra can reach Dograh via:

```
DOGRAH_API_URL=http://dograh-backend.railway.internal:8000
```

This is **faster** (no TLS overhead, no egress) and **more secure** (backend never exposed publicly if you remove the public domain from Dograh).

---

#### Step 8: Set Up Volume for Dograh (if using SQLite)

If Dograh uses SQLite in development:
1. Railway Dashboard → dograh-backend service → Volumes → Add Volume
2. Mount path: `/app/data`
3. Update Dograh's `DATABASE_URL` or `SQLITE_PATH` to `/app/data/dograh.db`

> **Recommended**: Switch to Supabase Postgres (`DATABASE_URL`) so you don't need a volume at all.

---

## Part 4 — Is the Next.js RAG Proxy a Bottleneck?

### Short answer: Yes, slightly — but it's justified and acceptable for your MVP.

### The Current Architecture

```
Dograh (call in progress)
    ↓ HTTP POST
/api/voice/knowledge-base (Next.js)
    ↓ embed query (Google API ~100-200ms)
    ↓ pgvector similarity search (Supabase ~30-80ms)
    ↓ return chunks
Dograh
    ↓ inject into LLM context
```

**Total added latency per RAG call: ~150-300ms**

### Why It's Still the Right Design

| Concern | Reality |
|---------|---------|
| **Adds HTTP hop** | Yes, ~50-100ms network latency vs direct DB access |
| **Embedding happens in Next.js** | Google's embedding API: 100-200ms regardless of where you call it |
| **Next.js is stateless** | Each request is independent; no shared state bottleneck |
| **RAG is called once per user query** | Not per word, not streaming — one call per question |
| **Supabase connection pooling** | Next.js maintains Supabase connections efficiently via SSR pooling |

### Why Direct DB Access From Dograh Would Be Worse

If Dograh called Supabase directly:
- You'd need Dograh to have Supabase service role credentials
- You'd need to run the Google embedding model inside Dograh (adding a Python dependency and complexity)
- Dograh would need to manage workspace isolation logic (which `workspace_id` maps to which org)
- **Dimension mismatch risk**: If you ever change your embedding model, Dograh's search breaks

The Next.js proxy is the **correct architectural boundary**: it owns the Supabase schema knowledge and the embedding logic. Dograh just asks "what do you know about X for workspace Y?"

### When It WILL Become a Bottleneck

- **> 50 simultaneous RAG calls** (very unlikely at MVP scale)
- **Cold starts on Railway Hobby plan** — first request in a while takes 3-5s to wake Next.js up. Fix: upgrade to Pro, or add a health-check ping job.
- **Streaming voice responses** where RAG latency blocks the first audio byte

### The Real Fix (When Needed — Not Now)

When you're at scale, you can eliminate the Next.js hop by:

```
Option A: Give Dograh a direct Supabase connection + run embeddings inside Dograh
Option B: Deploy a dedicated vector search microservice (FastAPI with pgvector client)
Option C: Use Supabase's built-in pg_net to call the embedding API directly from SQL
```

**For your MVP launch: the current design is perfectly fine.** The 150-300ms RAG latency is well within the 1-2 second tolerable voice response time, and the architecture is clean and secure.

---

## Quick Checklist Before Going Live

- [ ] Supabase redirect URLs whitelisted for production domain
- [ ] Email confirmation setting configured correctly in Supabase Auth
- [ ] Login page fixed to honor `?redirect=` / `?next=` param (invite flow)
- [ ] `DOGRAH_API_SECRET` / `FLOWRA_SECRET` set to same strong secret value in both services
- [ ] Dograh `DATABASE_URL` pointing to Supabase Postgres (not local SQLite)
- [ ] Railway private networking enabled between Flowra and Dograh
- [ ] Supabase migrations run: `npx supabase db push` against production
- [ ] Sarvam / Gemini API keys set in Dograh Railway variables
- [ ] VoiceLink credentials configured in Dograh admin panel per client
- [ ] Dograh admin panel URL restricted to VPN/IP whitelist (never public)
