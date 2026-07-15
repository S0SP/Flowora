/**
 * Smart inbox routing rules.
 * When a new thread comes in, these rules determine auto-assignment.
 *
 * Rule types:
 * - keyword: message contains keyword → assign to agent/team
 * - source: from a specific campaign → assign to agent
 * - round_robin: distribute equally across a team
 * - least_active: assign to agent with fewest open chats
 * - time_based: route based on time of day
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data: rules } = await admin
      .from("inbox_routing_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    // Get team members for assignment options
    const { data: members } = await admin
      .from("workspace_members")
      .select("id, full_name, email, role, user_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active");

    return NextResponse.json({ rules: rules ?? [], members: members ?? [] });
  } catch (err) {
    return NextResponse.json({ rules: [], members: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const admin = await createAdminClient();

    const { id, name, rule_type, conditions, action, priority = 0, is_active = true } = body;

    const upsertData = {
      workspace_id: workspaceId,
      name,
      rule_type,
      conditions,
      action,
      priority,
      is_active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      const { data, error } = await admin.from("inbox_routing_rules").update(upsertData).eq("id", id).eq("workspace_id", workspaceId).select().single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await admin.from("inbox_routing_rules").insert(upsertData).select().single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ rule: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    await admin.from("inbox_routing_rules").delete().eq("id", id).eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


