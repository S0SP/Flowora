-- Generated Schema Migrations, Relations & Subscriptions --

CREATE TABLE public.activities (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid,
    actor_id uuid,
    type text NOT NULL,
    payload jsonb,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.api_keys (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    scopes ARRAY,
    last_used_at timestamp with time zone,
    created_by uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.audit_log (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_type text,
    target_id uuid,
    metadata jsonb,
    ip inet,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.campaign_recipients (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    wamid text,
    status USER-DEFINED NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.campaign_schedules (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    campaign_id uuid,
    name text NOT NULL,
    template_name text NOT NULL,
    template_language text,
    recipients_filter jsonb,
    recipient_count integer,
    status text,
    scheduled_at timestamp with time zone,
    timezone text,
    is_recurring boolean,
    recurrence_rule text,
    sent_count integer,
    delivered_count integer,
    failed_count integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.campaigns (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    channel USER-DEFINED NOT NULL,
    template_name text,
    template_language text,
    content jsonb,
    audience jsonb,
    status USER-DEFINED NOT NULL,
    total_contacts integer NOT NULL,
    sent_count integer NOT NULL,
    delivered_count integer NOT NULL,
    read_count integer NOT NULL,
    failed_count integer NOT NULL,
    click_count integer NOT NULL,
    estimated_credits integer,
    created_by uuid,
    scheduled_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone
);

CREATE TABLE public.canned_replies (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    shortcut text NOT NULL,
    title text,
    body text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.channel_connections (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    type USER-DEFINED NOT NULL,
    label text,
    is_active boolean NOT NULL,
    config jsonb NOT NULL,
    secrets_enc bytea,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    registered_at timestamp with time zone,
    subscribed_apps_at timestamp with time zone,
    last_registration_error text
);

CREATE TABLE public.chatbot_faqs (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    is_active boolean,
    match_type text,
    priority integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.chatbot_prompt_history (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    chatbot_id uuid NOT NULL,
    system_prompt text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.chatbot_settings (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    bot_name text NOT NULL,
    persona text,
    language text,
    response_length integer,
    fallback_message text,
    is_active boolean,
    gemini_api_key text,
    model text,
    temperature double precision,
    max_tokens integer,
    use_knowledge_base boolean,
    whatsapp_enabled boolean,
    web_widget_enabled boolean,
    escalation_enabled boolean,
    escalation_trigger text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.chatbots (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    is_enabled boolean NOT NULL,
    system_prompt text,
    model text,
    temperature numeric,
    max_tokens integer,
    knowledge_base_id uuid,
    tools_config jsonb,
    prompt_cache_name text,
    prompt_cache_expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.cloned_voices (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    status USER-DEFINED NOT NULL,
    provider text,
    provider_voice_id text,
    sample_url text,
    preview_url text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.contacts (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    phone text,
    name text,
    email text,
    company text,
    avatar_url text,
    status USER-DEFINED NOT NULL,
    owner_id uuid,
    lead_score integer,
    tags ARRAY,
    custom_fields jsonb,
    source text,
    message_count integer NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    whatsapp_opted_in boolean,
    stage text,
    channel text,
    full_name text
);

CREATE TABLE public.conversation_notes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    mentions ARRAY,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.conversations (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    channel USER-DEFINED NOT NULL,
    state USER-DEFINED NOT NULL,
    assigned_to uuid,
    is_bot_active boolean NOT NULL,
    human_requested boolean NOT NULL,
    tags ARRAY,
    last_message_at timestamp with time zone,
    last_message_preview text,
    unread_count integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.credit_ledger (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    amount integer NOT NULL,
    reason USER-DEFINED NOT NULL,
    feature text,
    ref_type text,
    ref_id uuid,
    member_id uuid,
    balance_after integer,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.credit_wallets (
    workspace_id uuid NOT NULL,
    balance integer NOT NULL,
    monthly_grant integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.custom_field_schemas (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    options ARRAY,
    created_at timestamp with time zone,
    created_by uuid
);

CREATE TABLE public.dashboard_daily_metrics (
    workspace_id uuid NOT NULL,
    day date NOT NULL,
    conversations integer,
    messages integer,
    leads integer,
    voice_calls integer,
    credits_used integer,
    revenue_cents integer
);

CREATE TABLE public.inbox_routing_rules (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    rule_type text NOT NULL,
    conditions jsonb,
    action jsonb,
    priority integer,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.integrations (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    provider text NOT NULL,
    status text NOT NULL,
    account_label text,
    scopes ARRAY,
    secrets_enc bytea,
    config jsonb,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.invitations (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    email text NOT NULL,
    role USER-DEFINED NOT NULL,
    permissions jsonb NOT NULL,
    credit_limit integer,
    token text NOT NULL,
    invited_by uuid,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.invoices (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    stripe_invoice_id text,
    amount_cents integer NOT NULL,
    currency text,
    status text,
    pdf_url text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.kg_edges (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    knowledge_base_id uuid NOT NULL,
    source_id uuid NOT NULL,
    target_id uuid NOT NULL,
    relation text NOT NULL,
    weight numeric
);

CREATE TABLE public.kg_nodes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    knowledge_base_id uuid NOT NULL,
    label text NOT NULL,
    type text,
    properties jsonb
);

CREATE TABLE public.knowledge_bases (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    embedding_model text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.knowledge_chunks (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    knowledge_base_id uuid NOT NULL,
    document_id uuid NOT NULL,
    content text NOT NULL,
    embedding USER-DEFINED,
    token_count integer,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.knowledge_documents (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    knowledge_base_id uuid NOT NULL,
    title text,
    source_type text NOT NULL,
    source_url text,
    storage_path text,
    status USER-DEFINED NOT NULL,
    error_message text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.knowledge_sources (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    source_url text,
    file_path text,
    status text NOT NULL,
    error_message text,
    metadata jsonb,
    total_chunks integer,
    total_tokens integer,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.lead_capture_leads (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    lead_capture_settings_id uuid NOT NULL,
    phone text NOT NULL,
    name text,
    email text,
    row_hash text NOT NULL,
    status USER-DEFINED NOT NULL,
    channel_status jsonb,
    scheduled_for timestamp with time zone,
    processed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone NOT NULL,
    workflow_id uuid
);

CREATE TABLE public.lead_capture_settings (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text,
    is_active boolean NOT NULL,
    sheet_url text NOT NULL,
    phone_column text NOT NULL,
    name_column text,
    email_column text,
    delay_minutes integer NOT NULL,
    whatsapp_enabled boolean,
    template_name text,
    template_language text,
    email_enabled boolean,
    email_template_id text,
    email_subject text,
    email_brand_name text,
    email_logo_url text,
    email_title text,
    email_body text,
    email_button_text text,
    email_button_url text,
    email_footer text,
    email_from text,
    email_from_name text,
    smtp_host text,
    smtp_port integer,
    smtp_user text,
    smtp_password text,
    voice_enabled boolean,
    voice_agent_type USER-DEFINED,
    voice_id text,
    voice_prompt text,
    custom_columns jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.leads (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id uuid NOT NULL,
    owner_id uuid,
    value numeric,
    "position" integer NOT NULL,
    status text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.member_presence (
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    status text NOT NULL,
    last_seen_at timestamp with time zone NOT NULL
);

CREATE TABLE public.message_templates (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    name text NOT NULL,
    category text NOT NULL,
    language text,
    header_type text,
    header_content text,
    header_handle text,
    body_text text NOT NULL,
    footer_text text,
    buttons jsonb,
    sample_values jsonb,
    status text DEFAULT 'DRAFT'::text,
    meta_template_id text,
    quality_score text,
    header_media_url text,
    rejection_reason text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.messages (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    thread_id uuid,
    wa_message_id text,
    content text,
    type text,
    sender_type text,
    sender_id uuid,
    status text,
    file_url text,
    file_name text,
    file_size integer,
    thumbnail_url text,
    metadata jsonb,
    created_at timestamp with time zone
);

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.pipeline_stages (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    name text NOT NULL,
    color text,
    "position" integer NOT NULL
);

CREATE TABLE public.pipelines (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    is_default boolean,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.plans (
    id text NOT NULL,
    name text NOT NULL,
    monthly_credits integer NOT NULL,
    price_inr_paise integer NOT NULL,
    features jsonb,
    razorpay_plan_id text
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    phone text,
    timezone text,
    locale text,
    onboarding_completed boolean NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.subscriptions (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    plan_id text NOT NULL,
    status USER-DEFINED NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.tags (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    color text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by uuid
);

CREATE TABLE public.threads (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid,
    channel text NOT NULL,
    channel_connection_id uuid,
    status text,
    assigned_to uuid,
    ai_active boolean,
    unread_count integer,
    last_message_at timestamp with time zone,
    last_message_preview text,
    tags ARRAY,
    priority text,
    metadata jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.ticket_events (
    id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    from_value text,
    to_value text,
    note text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.ticket_tags (
    id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    tagged_user_id uuid NOT NULL,
    tagged_by uuid,
    reason text,
    is_read boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.tickets (
    id uuid NOT NULL,
    ref bigint NOT NULL,
    workspace_id uuid NOT NULL,
    thread_id uuid,
    contact_id uuid NOT NULL,
    subject text NOT NULL,
    description text,
    status text NOT NULL,
    severity text NOT NULL,
    flags ARRAY,
    source text NOT NULL,
    escalation_reason text,
    assigned_to uuid,
    created_by uuid,
    resolved_by uuid,
    anchor_message_id uuid,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.voice_agent_settings (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    voice_id text NOT NULL,
    agent_type text NOT NULL,
    language_preset text NOT NULL,
    sarvam_language text NOT NULL,
    deepgram_language text NOT NULL,
    system_prompt text,
    call_objective text,
    calling_hours_start time without time zone,
    calling_hours_end time without time zone,
    max_call_attempts integer,
    retry_interval_minutes integer,
    recording_enabled boolean,
    transcription_enabled boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.voice_agents (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    is_enabled boolean NOT NULL,
    agent_type USER-DEFINED NOT NULL,
    voice_id text,
    cloned_voice_id uuid,
    system_prompt text,
    knowledge_base_id uuid,
    first_message text,
    vapi_assistant_id text,
    config jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.voice_calls (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    phone_number text NOT NULL,
    agent_type text NOT NULL,
    voice_id text,
    status text NOT NULL,
    livekit_room_name text,
    livekit_sip_call_id text,
    recording_url text,
    transcript text,
    duration_seconds integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.voice_transcripts (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    call_id uuid NOT NULL,
    role text NOT NULL,
    text text NOT NULL,
    ts_ms integer,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.webhook_deliveries (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    webhook_id uuid NOT NULL,
    event text NOT NULL,
    payload jsonb,
    response_code integer,
    attempts integer,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.webhooks (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    url text NOT NULL,
    events ARRAY NOT NULL,
    secret text NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.whatsapp_calls (
    id uuid NOT NULL,
    contact_id uuid,
    phone_number text NOT NULL,
    meta_call_id text,
    direction USER-DEFINED NOT NULL,
    status USER-DEFINED NOT NULL,
    duration_seconds integer,
    recording_url text,
    transcript_text text,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.workflow_run_steps (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    run_id uuid NOT NULL,
    node_id text NOT NULL,
    node_type text NOT NULL,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    credits_used integer,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.workflow_runs (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    contact_id uuid,
    status USER-DEFINED NOT NULL,
    context jsonb,
    current_node text,
    wake_at timestamp with time zone,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone
);

CREATE TABLE public.workflow_templates (
    id uuid NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    graph jsonb NOT NULL,
    is_public boolean
);

CREATE TABLE public.workflows (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status USER-DEFINED NOT NULL,
    trigger_type text,
    trigger_config jsonb,
    graph jsonb NOT NULL,
    version integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.workspace_invitations (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    token_hash text NOT NULL,
    role text NOT NULL,
    label text,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE public.workspace_members (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role USER-DEFINED NOT NULL,
    status USER-DEFINED NOT NULL,
    permissions jsonb NOT NULL,
    credit_limit integer,
    credits_used integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    email text NOT NULL,
    full_name text,
    monthly_credit_limit integer,
    max_concurrent_chats integer,
    invite_token text,
    invited_by uuid,
    last_seen_at timestamp with time zone,
    avatar_url text
);

CREATE TABLE public.workspace_settings (
    workspace_id uuid NOT NULL,
    business_hours jsonb,
    default_language text,
    auto_assign boolean,
    notification_prefs jsonb,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.workspaces (
    id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    industry text,
    timezone text,
    owner_id uuid NOT NULL,
    onboarding_completed boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    default_currency text NOT NULL
);

-- Entity Relations (Foreign Keys) --
ALTER TABLE public.inbox_routing_rules ADD CONSTRAINT fk_inbox_routing_rules_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_thread_id FOREIGN KEY (thread_id) REFERENCES public.threads(id);
ALTER TABLE public.whatsapp_calls ADD CONSTRAINT fk_whatsapp_calls_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.tags ADD CONSTRAINT fk_tags_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.workspace_invitations ADD CONSTRAINT fk_workspace_invitations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.knowledge_sources ADD CONSTRAINT fk_knowledge_sources_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.chatbot_settings ADD CONSTRAINT fk_chatbot_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.campaign_schedules ADD CONSTRAINT fk_campaign_schedules_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_assigned_to FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);
ALTER TABLE public.voice_agent_settings ADD CONSTRAINT fk_voice_agent_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.chatbot_faqs ADD CONSTRAINT fk_chatbot_faqs_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.member_presence ADD CONSTRAINT fk_member_presence_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_thread_id FOREIGN KEY (thread_id) REFERENCES public.threads(id);
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.ticket_events ADD CONSTRAINT fk_ticket_events_ticket_id FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);
ALTER TABLE public.ticket_tags ADD CONSTRAINT fk_ticket_tags_ticket_id FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);
ALTER TABLE public.workspaces ADD CONSTRAINT fk_workspaces_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
ALTER TABLE public.workspace_members ADD CONSTRAINT fk_workspace_members_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.workspace_members ADD CONSTRAINT fk_workspace_members_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.invitations ADD CONSTRAINT fk_invitations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.invitations ADD CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES public.profiles(id);
ALTER TABLE public.workspace_settings ADD CONSTRAINT fk_workspace_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.channel_connections ADD CONSTRAINT fk_channel_connections_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.contacts ADD CONSTRAINT fk_contacts_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.contacts ADD CONSTRAINT fk_contacts_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
ALTER TABLE public.pipelines ADD CONSTRAINT fk_pipelines_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT fk_pipeline_stages_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT fk_pipeline_stages_pipeline_id FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id);
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_pipeline_id FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id);
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_stage_id FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id);
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_actor_id FOREIGN KEY (actor_id) REFERENCES public.profiles(id);
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversations(id);
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_author_id FOREIGN KEY (author_id) REFERENCES public.profiles(id);
ALTER TABLE public.canned_replies ADD CONSTRAINT fk_canned_replies_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.canned_replies ADD CONSTRAINT fk_canned_replies_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.campaigns ADD CONSTRAINT fk_campaigns_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.campaigns ADD CONSTRAINT fk_campaigns_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_campaign_id FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.workflows ADD CONSTRAINT fk_workflows_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.workflows ADD CONSTRAINT fk_workflows_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_workflow_id FOREIGN KEY (workflow_id) REFERENCES public.workflows(id);
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.workflow_run_steps ADD CONSTRAINT fk_workflow_run_steps_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.workflow_run_steps ADD CONSTRAINT fk_workflow_run_steps_run_id FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id);
ALTER TABLE public.chatbots ADD CONSTRAINT fk_chatbots_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_chatbot_id FOREIGN KEY (chatbot_id) REFERENCES public.chatbots(id);
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.cloned_voices ADD CONSTRAINT fk_cloned_voices_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.cloned_voices ADD CONSTRAINT fk_cloned_voices_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_cloned_voice_id FOREIGN KEY (cloned_voice_id) REFERENCES public.cloned_voices(id);
ALTER TABLE public.voice_transcripts ADD CONSTRAINT fk_voice_transcripts_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.lead_capture_settings ADD CONSTRAINT fk_lead_capture_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.lead_capture_leads ADD CONSTRAINT fk_lead_capture_leads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.lead_capture_leads ADD CONSTRAINT fk_lead_capture_leads_lead_capture_settings_id FOREIGN KEY (lead_capture_settings_id) REFERENCES public.lead_capture_settings(id);
ALTER TABLE public.knowledge_bases ADD CONSTRAINT fk_knowledge_bases_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.chatbots ADD CONSTRAINT fk_chatbots_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.knowledge_documents ADD CONSTRAINT fk_knowledge_documents_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.knowledge_documents ADD CONSTRAINT fk_knowledge_documents_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_document_id FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id);
ALTER TABLE public.kg_nodes ADD CONSTRAINT fk_kg_nodes_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.kg_nodes ADD CONSTRAINT fk_kg_nodes_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id);
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_source_id FOREIGN KEY (source_id) REFERENCES public.kg_nodes(id);
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_target_id FOREIGN KEY (target_id) REFERENCES public.kg_nodes(id);
ALTER TABLE public.subscriptions ADD CONSTRAINT fk_subscriptions_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.credit_wallets ADD CONSTRAINT fk_credit_wallets_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.credit_ledger ADD CONSTRAINT fk_credit_ledger_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.credit_ledger ADD CONSTRAINT fk_credit_ledger_member_id FOREIGN KEY (member_id) REFERENCES public.workspace_members(id);
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.webhooks ADD CONSTRAINT fk_webhooks_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_webhook_id FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id);
ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id);
ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_actor_id FOREIGN KEY (actor_id) REFERENCES public.profiles(id);
ALTER TABLE public.dashboard_daily_metrics ADD CONSTRAINT fk_dashboard_daily_metrics_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.message_templates ADD CONSTRAINT fk_message_templates_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);
ALTER TABLE public.custom_field_schemas ADD CONSTRAINT fk_custom_field_schemas_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);

-- Custom Database Triggers --
CREATE TRIGGER set_whatsapp_calls_updated_at BEFORE UPDATE ON public.whatsapp_calls FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION update_tickets_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER workspaces_touch BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER cloned_voices_touch BEFORE UPDATE ON public.cloned_voices FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER voice_calls_updated_at BEFORE UPDATE ON public.voice_calls FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER workspace_settings_touch BEFORE UPDATE ON public.workspace_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER channel_connections_touch BEFORE UPDATE ON public.channel_connections FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER workflows_touch BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER chatbots_touch BEFORE UPDATE ON public.chatbots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER voice_agents_touch BEFORE UPDATE ON public.voice_agents FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER lead_capture_settings_touch BEFORE UPDATE ON public.lead_capture_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER subscriptions_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER integrations_touch BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Supabase Realtime Stream Replications --
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cloned_voices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.member_presence;
