-- Inbox routing rules table
create table if not exists inbox_routing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  rule_type text not null check (rule_type in ('keyword', 'source', 'round_robin', 'least_active', 'time_based', 'language')),
  conditions jsonb default '{}',
  action jsonb default '{}',
  priority integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inbox_routing_rules_workspace_idx on inbox_routing_rules(workspace_id);

-- Seed default routing examples (run in your workspace after creating account)
-- INSERT INTO inbox_routing_rules (workspace_id, name, rule_type, conditions, action, priority)
-- VALUES (
--   '<your-workspace-id>',
--   'Sales Keywords → Sales Agent',
--   'keyword',
--   '{"keywords": ["price", "pricing", "cost", "buy", "purchase", "discount", "offer"]}',
--   '{"type": "assign_agent", "agentId": "<sales-agent-user-id>", "disableAi": false}',
--   10
-- );
