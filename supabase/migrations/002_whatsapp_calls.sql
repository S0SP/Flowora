DO $$ BEGIN
    CREATE TYPE whatsapp_call_status AS ENUM ('connecting', 'ringing', 'connected', 'terminated', 'missed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE whatsapp_call_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create function to update the modified column if it doesn't exist
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create whatsapp_calls table
CREATE TABLE IF NOT EXISTS whatsapp_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    meta_call_id TEXT UNIQUE,
    direction whatsapp_call_direction NOT NULL,
    status whatsapp_call_status NOT NULL DEFAULT 'connecting',
    duration_seconds INTEGER DEFAULT 0,
    recording_url TEXT,
    transcript_text TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying calls by contact
CREATE INDEX idx_whatsapp_calls_contact_id ON whatsapp_calls(contact_id);

-- Trigger for updated_at
CREATE TRIGGER set_whatsapp_calls_updated_at
BEFORE UPDATE ON whatsapp_calls
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Enable RLS
ALTER TABLE whatsapp_calls ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Users can view their own whatsapp calls"
    ON whatsapp_calls FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM contacts c 
        WHERE c.id = whatsapp_calls.contact_id 
        AND c.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    ));

CREATE POLICY "Users can insert their own whatsapp calls"
    ON whatsapp_calls FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM contacts c 
        WHERE c.id = whatsapp_calls.contact_id 
        AND c.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    ));

CREATE POLICY "Users can update their own whatsapp calls"
    ON whatsapp_calls FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM contacts c 
        WHERE c.id = whatsapp_calls.contact_id 
        AND c.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
    ));

-- In order to support webhooks updating the calls table based on Meta call_id, 
-- we need to either bypass RLS for the service role or verify via the contact's ownership.
-- (Supabase clients using service_role bypass RLS by default).
