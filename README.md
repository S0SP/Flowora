# Autonomous Lead Outreach System

A powerful, AI-driven CRM and outreach system that automatically captures leads from Google Sheets and engages them via WhatsApp Messages and AI Voice Calls. Built with Next.js, Supabase, Meta WhatsApp API, and LiveKit AI Agents.

## 🚀 Features

- **Multi-Channel Outreach**: Send WhatsApp text/template messages or trigger realistic AI Voice Calls to your leads.
- **Google Sheets Integration**: Automatically poll and capture new leads dropping into a connected Google Sheet.
- **AI Voice Agent**: A fully interactive, low-latency conversational AI agent powered by LiveKit, capable of speaking multiple languages (e.g., English and Hindi) using advanced LLMs (Groq/Gemini) and TTS (Sarvam/Cartesia).
- **Scheduled Campaigns**: Bulk outreach capabilities. Schedule messages and calls to be sent at specific dates and times, or immediately.
- **BYOK (Bring Your Own Key)**: Secure, database-backed UI for configuring your Meta, LiveKit, and AI API keys without hardcoding them into environment variables.
- **Call Recordings**: Automatically records AI voice calls and uploads them to Supabase Storage, viewable directly from your dashboard call history.
- **Serverless & Scalable**: Designed to run the dashboard on Vercel (Serverless) while running the persistent Voice Worker in a Docker container (Railway, Render, or Oracle Cloud).

---

## 🏗️ Architecture

This repository is split into two distinct parts:
1. **Frontend & API (`/src`)**: A Next.js 14 App Router application. Handles the UI, database interactions, Google Sheets syncing, Meta WhatsApp API calls, and Cron job endpoints.
2. **AI Voice Worker (`/voice-worker`)**: A Python application that connects to LiveKit to act as the AI agent answering and making SIP trunk calls.

---

## 🛠️ Quick Start & Deployment

### 1. Database Setup (Supabase)
1. Create a project on [Supabase](https://supabase.com).
2. Run the SQL files found in the `/database` folder in your Supabase SQL Editor to set up the necessary tables (including the `app_settings` BYOK table).
3. Get your `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Deploying the Frontend (Vercel)
1. Push this repository to GitHub.
2. Import the repository into [Vercel](https://vercel.com).
3. Add the following Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET` (A random string you generate, e.g., `my-super-secret-cron-123`)
4. Deploy!
5. **Important**: Go to your deployed dashboard, navigate to **Settings (BYOK)**, and enter your Meta, LiveKit, and AI API keys. 

*Note: `vercel.json` already defines a Vercel Cron that pings `/api/campaigns/process-queue` every minute (this drives campaign sending AND Lead Capture sheet sync/processing). Per-minute crons require the Vercel **Pro** plan. On the **Hobby/Free** tier (crons run at most once per day), set up an external cron on [cron-job.org](https://cron-job.org) to ping `https://your-domain.vercel.app/api/campaigns/process-queue` every minute instead.*

### 3. Deploying the Voice Worker (Railway / Render / Oracle Cloud)
Because the Voice Worker requires a persistent WebSocket connection, it cannot run on Vercel. 
1. Deploy this exact same repository to a host that supports Docker (like Railway).
2. Set the **Root Directory** or **Build Context** to `/voice-worker`.
3. Provide the following Environment Variables to the worker:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. The worker will automatically fetch the LiveKit and AI keys from your Supabase BYOK settings and boot up the agent!

---

## 📖 How to Use

1. **Settings**: Start by going to `/dashboard/settings` and adding your Meta API Keys and LiveKit SIP details.
2. **Lead Capture**: Go to the Lead Capture tab. Paste a public Google Sheet URL. The system will map the columns (Name, Phone, etc.). Choose what happens when a lead arrives (e.g., Wait 5 minutes, then send a WhatsApp Template AND trigger an AI Voice Call).
3. **Campaigns**: Go to Campaigns to bulk-import numbers and schedule an immediate or future blast of WhatsApp messages and AI Calls.
4. **Call History**: View past calls, see the AI's transcription, and listen to the MP3 recordings of the conversation.

---

## 💻 Local Development

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your Supabase keys.
3. Start the Next.js dev server:
   ```bash
   npm run dev
   ```
4. Start the Python Voice Worker:
   ```bash
   cd voice-worker
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r requirements.txt
   python agent.py start
   ```
