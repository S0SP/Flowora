-- Migration 020: Engine billing tables + workflow trigger state
-- Run via: supabase migration new billing_and_engine_tables
-- Or apply directly via psql / Supabase SQL editor

-- ── Billing tables (owned by Flowra Engine, readable by frontend) ──────────

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID UNIQUE NOT NULL,
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    billing_cycle VARCHAR(20) DEFAULT 'monthly',
    status VARCHAR(50) DEFAULT 'active',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_customer_id VARCHAR(100),
    company_name VARCHAR(255),
    billing_address TEXT,
    gst_number VARCHAR(50),
    has_voice_addon BOOLEAN DEFAULT false,
    ai_credits_addon INTEGER DEFAULT 0,
    amount_paid INTEGER DEFAULT 0,      -- in paise (INR × 100)
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent DECIMAL(5,2),
    discount_amount DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    max_uses INTEGER DEFAULT 0,         -- 0 = unlimited
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_credit_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID UNIQUE NOT NULL,
    balance INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    amount INTEGER NOT NULL,            -- Positive = grant, Negative = usage
    description VARCHAR(255),
    reference_id VARCHAR(100),          -- Razorpay order/payment ID
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Engine trigger state table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_trigger_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID UNIQUE NOT NULL,
    last_polled_at TIMESTAMPTZ,
    rows_processed INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace_id
    ON workspace_subscriptions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_workspace_id
    ON ai_credit_transactions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workflow_trigger_states_workflow_id
    ON workflow_trigger_states(workflow_id);

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_trigger_states ENABLE ROW LEVEL SECURITY;

-- Service role (engine) can access all rows
CREATE POLICY "engine_service_role_workspace_subscriptions"
    ON workspace_subscriptions FOR ALL TO service_role USING (true);

CREATE POLICY "engine_service_role_coupons"
    ON coupons FOR ALL TO service_role USING (true);

CREATE POLICY "engine_service_role_ai_credit_ledgers"
    ON ai_credit_ledgers FOR ALL TO service_role USING (true);

CREATE POLICY "engine_service_role_ai_credit_transactions"
    ON ai_credit_transactions FOR ALL TO service_role USING (true);

CREATE POLICY "engine_service_role_workflow_trigger_states"
    ON workflow_trigger_states FOR ALL TO service_role USING (true);

-- Authenticated users can read their own workspace data
CREATE POLICY "users_read_own_subscription"
    ON workspace_subscriptions FOR SELECT TO authenticated
    USING (workspace_id IN (
        SELECT id FROM workspaces WHERE owner_id = auth.uid()
    ));

CREATE POLICY "users_read_own_ai_credits"
    ON ai_credit_ledgers FOR SELECT TO authenticated
    USING (workspace_id IN (
        SELECT id FROM workspaces WHERE owner_id = auth.uid()
    ));

CREATE POLICY "users_read_own_credit_transactions"
    ON ai_credit_transactions FOR SELECT TO authenticated
    USING (workspace_id IN (
        SELECT id FROM workspaces WHERE owner_id = auth.uid()
    ));

-- Seed initial founder coupon (safe to run multiple times)
INSERT INTO coupons (code, discount_percent, is_active, max_uses)
VALUES ('FOUNDER20', 20.00, true, 100)
ON CONFLICT (code) DO NOTHING;
