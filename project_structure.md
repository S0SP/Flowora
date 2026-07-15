# Flowra Complete Project Structure

Below is the complete recursive list of all files in the **Flowra** repository.

```text
Flowra/
├── database/
│   ├── migrations/
│   │   ├── 001_multi_tenant.sql
│       └── 002_tickets.sql
│   ├── app_settings.sql
│   ├── consolidated_schema.sql
│   ├── fix-functions.sql
│   ├── migration-ai-agents.sql
│   ├── migration-chatbot-caching.sql
│   ├── migration-chatbot-groq.sql
│   ├── migration-chatbot-tools.sql
│   ├── migration-email-settings.sql
│   ├── migration-inbox-routing.sql
│   ├── migration-knowledge-base.sql
│   ├── migration-lead-capture-channel-status.sql
│   ├── migration-lead-capture-multi-workflow.sql
│   ├── migration-lead-capture.sql
│   ├── migration-scheduler.sql
│   ├── migration-voice-settings.sql
│   ├── schema.sql
│   ├── voice_calls_add_cost.sql
    └── voice_calls.sql
├── design_spec/
│   ├── 00_design_system.json
│   ├── 01_dashboard_part1.json
│   ├── 01_dashboard_part2.json
│   ├── 01_dashboard_part3.json
│   ├── 01_dashboard_part4.json
│   ├── 01_dashboard.json
│   ├── 02_inbox.json
│   ├── 02_shared_inbox_part1.json
│   ├── 02_shared_inbox_part2.json
│   ├── 03_contacts.json
│   ├── 03_crm.json
│   ├── 04_broadcast.json
│   ├── 04_leads_kanban.json
│   ├── 05_chatbot.json
│   ├── 05_workflow_builder_part1.json
│   ├── 05_workflow_builder_part2.json
│   ├── 05_workflow_builder_part3.json
│   ├── 06_campaign_builder.json
│   ├── 06_voice_agent.json
│   ├── 07_ai_chatbot.json
│   ├── 07_workflow_builder.json
│   ├── 08_settings_billing.json
│   ├── 08_voice_agent_part1.json
│   ├── 08_voice_agent_part2.json
│   ├── 09_knowledge_hub.json
│   ├── 10_analytics.json
│   ├── 11_team_agents.json
│   ├── 12_settings.json
│   ├── 13_integrations.json
│   ├── 14_onboarding_flow.json
│   ├── 15_mobile_companion.json
│   ├── 16_micro_interactions.json
    └── flowora_frontend_stack.json
├── docs/
│   ├── 01_BACKEND_ARCHITECTURE.md
│   ├── 03_IMPLEMENTATION_PLAN.md
│   ├── DEPLOYMENT_GUIDE.md
    └── ui-ux-audit-and-plan.md
├── mockup/
│   ├── 75e83323-3e07-4800-bc74-2ec99b39a353.png
│   ├── brand_guideline and user flow.txt
│   ├── dashboard.png
    └── frontend architecture.txt
├── scripts/
│   ├── extract_arch.py
    └── extract_json.py
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analytics/
│   │   │       └── route.ts
│   │   │   ├── billing/
│   │   │       ├── credits/
│   │   │           └── route.ts
│   │   │   ├── campaigns/
│   │   │   │   ├── [id]/
│   │   │   │       └── route.ts
│   │   │   │   ├── process-queue/
│   │   │   │       └── route.ts
│   │   │   │   ├── schedule/
│   │   │   │       └── route.ts
│   │   │       └── route.ts
│   │   │   ├── chatbot/
│   │   │   │   ├── faqs/
│   │   │   │       └── route.ts
│   │   │   │   ├── test/
│   │   │   │       └── route.ts
│   │   │       └── route.ts
│   │   │   ├── chats/
│   │   │       └── route.ts
│   │   │   ├── contacts/
│   │   │       └── route.ts
│   │   │   ├── cron/
│   │   │   │   ├── poll-sheets/
│   │   │   │       └── route.ts
│   │   │   │   ├── process-schedules/
│   │   │   │       └── route.ts
│   │   │       ├── send-reminders/
│   │   │           └── route.ts
│   │   │   ├── inbox/
│   │   │   │   ├── assign/
│   │   │   │       └── route.ts
│   │   │   │   ├── routing/
│   │   │   │   │   ├── helper.ts
│   │   │   │       └── route.ts
│   │   │   │   ├── threads/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── messages/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │       └── route.ts
│   │   │   │       └── route.ts
│   │   │       ├── upload-media/
│   │   │           └── route.ts
│   │   │   ├── jobs/
│   │   │   │   ├── campaign-execute/
│   │   │   │       └── route.ts
│   │   │       ├── workflow-step/
│   │   │           └── route.ts
│   │   │   ├── knowledge/
│   │   │   │   ├── documents/
│   │   │   │       └── route.ts
│   │   │   │   ├── process/
│   │   │   │       └── route.ts
│   │   │   │   ├── query/
│   │   │   │       └── route.ts
│   │   │       ├── upload/
│   │   │           └── route.ts
│   │   │   ├── lead-capture/
│   │   │       └── route.ts
│   │   │   ├── leads/
│   │   │       └── route.ts
│   │   │   ├── messages/
│   │   │       └── route.ts
│   │   │   ├── settings/
│   │   │   │   ├── keys/
│   │   │   │       └── route.ts
│   │   │       └── route.ts
│   │   │   ├── team/
│   │   │       └── route.ts
│   │   │   ├── templates/
│   │   │       └── route.ts
│   │   │   ├── tickets/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── escalate/
│   │   │   │   │       └── route.ts
│   │   │   │   │   ├── notes/
│   │   │   │   │       └── route.ts
│   │   │   │   │   ├── reply/
│   │   │   │   │       └── route.ts
│   │   │   │   │   ├── resolve/
│   │   │   │   │       └── route.ts
│   │   │   │   │   ├── tag/
│   │   │   │   │       └── route.ts
│   │   │   │       └── route.ts
│   │   │       └── route.ts
│   │   │   ├── voice/
│   │   │   │   ├── calls/
│   │   │   │   │   ├── [id]/
│   │   │   │   │       └── route.ts
│   │   │   │       └── route.ts
│   │   │   │   ├── cleanup/
│   │   │   │       └── route.ts
│   │   │   │   ├── dial/
│   │   │   │       └── route.ts
│   │   │   │   ├── inbound/
│   │   │   │       └── route.ts
│   │   │   │   ├── settings/
│   │   │   │       └── route.ts
│   │   │   │   ├── transcript/
│   │   │   │       └── route.ts
│   │   │   │   ├── voices/
│   │   │   │       ├── sample/
│   │   │   │           └── route.ts
│   │   │       ├── webhook/
│   │   │           └── route.ts
│   │   │   ├── webhook/
│   │   │       └── route.ts
│   │   │   ├── webhooks/
│   │   │   │   ├── stripe/
│   │   │   │       └── route.ts
│   │   │       ├── whatsapp/
│   │   │           └── route.ts
│   │   │   ├── widget/
│   │   │   │   ├── chat/
│   │   │   │       └── route.ts
│   │   │   │   ├── config/
│   │   │   │       └── route.ts
│   │   │       ├── embed.js/
│   │   │           └── route.ts
│   │   │   ├── workflows/
│   │   │   │   ├── runs/
│   │   │   │       └── route.ts
│   │   │   │   ├── trigger/
│   │   │   │       └── route.ts
│   │   │       └── route.ts
│   │       ├── workspaces/
│   │           └── route.ts
│   │   ├── auth/
│   │   │   ├── callback/
│   │   │       └── route.ts
│   │   │   ├── login/
│   │   │       └── page.tsx
│   │   │   ├── signup/
│   │   │       └── page.tsx
│   │       └── layout.tsx
│   │   ├── dashboard/
│   │   │   ├── analytics/
│   │   │   │   ├── loading.tsx
│   │   │       └── page.tsx
│   │   │   ├── campaigns/
│   │   │   │   ├── loading.tsx
│   │   │       └── page.tsx
│   │   │   ├── chatbot/
│   │   │       └── page.tsx
│   │   │   ├── contacts/
│   │   │   │   ├── loading.tsx
│   │   │       └── page.tsx
│   │   │   ├── inbox/
│   │   │   │   ├── loading.tsx
│   │   │       └── page.tsx
│   │   │   ├── integrations/
│   │   │       └── page.tsx
│   │   │   ├── knowledge/
│   │   │       └── page.tsx
│   │   │   ├── lead-capture/
│   │   │       └── page.tsx
│   │   │   ├── leads/
│   │   │       └── page.tsx
│   │   │   ├── settings/
│   │   │       └── page.tsx
│   │   │   ├── team/
│   │   │       └── page.tsx
│   │   │   ├── tickets/
│   │   │   │   ├── [id]/
│   │   │   │       └── page.tsx
│   │   │       └── page.tsx
│   │   │   ├── voice/
│   │   │       └── page.tsx
│   │   │   ├── voice-agent/
│   │   │   │   ├── calls/
│   │   │   │       └── page.tsx
│   │   │   │   ├── voices/
│   │   │   │       └── page.tsx
│   │   │       └── page.tsx
│   │   │   ├── workflows/
│   │   │   │   ├── builder/
│   │   │   │       └── page.tsx
│   │   │       └── page.tsx
│   │   │   ├── error.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── loading.tsx
│   │       └── page.tsx
│   │   ├── onboarding/
│   │       └── page.tsx
│   │   ├── widget/
│   │       ├── chat/
│   │           └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│       └── providers.tsx
│   ├── components/
│   │   ├── analytics/
│   │   │   ├── analytics-charts.tsx
│   │       └── stat-card.tsx
│   │   ├── atoms/
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │       └── Input.tsx
│   │   ├── campaign/
│   │   │   ├── campaign-sender.tsx
│   │   │   ├── campaign-status-badge.tsx
│   │   │   ├── campaign-table.tsx
│   │       └── recent-campaigns.tsx
│   │   ├── chat/
│   │       └── inbox-client.tsx
│   │   ├── contacts/
│   │       └── contacts-table.tsx
│   │   ├── dashboard/
│   │       └── DashboardShell.tsx
│   │   ├── layout/
│   │       └── theme-provider.tsx
│   │   ├── lead-capture/
│   │       └── lead-capture-client.tsx
│   │   ├── molecules/
│   │   ├── organisms/
│   │   │   ├── DashboardShell.tsx
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Topbar.tsx
│   │       └── WorkflowCanvas.tsx
│   │   ├── tickets/
│   │       └── ticket-detail-client.tsx
│       ├── ui/
│       │   ├── badge.tsx
│       │   ├── card.tsx
│       │   ├── empty-state.tsx
│       │   ├── form-field.tsx
│       │   ├── index.ts
│       │   ├── loading.tsx
│       │   ├── message-status.tsx
│       │   ├── page-header.tsx
│       │   ├── page-shell.tsx
│       │   ├── skeleton.tsx
│       │   ├── table.tsx
│           └── toggle.tsx
│   ├── context/
│   │   ├── NotificationsContext.tsx
│       └── WorkspaceContext.tsx
│   ├── hooks/
│   │   ├── use-inbox-store.ts
│       └── use-realtime.ts
│   ├── lib/
│   │   ├── api/
│   │       └── mock-db.ts
│   │   ├── store/
│   │   │   ├── useInboxStore.ts
│   │       └── useUIStore.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │       └── server.ts
│   │   ├── crypto.ts
│   │   ├── livekit.ts
│   │   ├── qstash.ts
│   │   ├── redis.ts
│   │   ├── stripe.ts
│   │   ├── tenant.ts
│   │   ├── utils.ts
│   │   ├── voices.ts
│       └── workflow-templates.ts
│   ├── scripts/
│       └── check-subscription.js
│   ├── services/
│   │   ├── ai.ts
│   │   ├── audit.ts
│   │   ├── credits.ts
│   │   ├── gemini-cache.ts
│   │   ├── lead-capture.ts
│   │   ├── mailer.ts
│   │   ├── meta.ts
│   │   ├── notifications.ts
│   │   ├── rag.ts
│   │   ├── scheduler.ts
│   │   ├── tickets.ts
│       └── vapi.ts
│   ├── types/
│       └── index.ts
│   ├── instrumentation.ts
    └── middleware.ts
├── supabase/
    ├── migrations/
        └── 001_tenancy_foundation.sql
├── voice-worker/
│   ├── KMS/
│       ├── logs/
│   ├── .env
│   ├── .env.example
│   ├── agent.py
│   ├── config.py
│   ├── Dockerfile
    └── requirements.txt
├── .env
├── .env.example
├── .gitignore
├── lead_capture_original.txt
├── lead_capture_original.zip
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.js
├── project_structure.md
├── README.md
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── vercel.json
└── voiceagent.code-workspace

```
