import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// GET — list scheduled campaigns
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data: schedules, error } = await admin
      .from("campaign_schedules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ schedules: schedules ?? [] });
  } catch (err) {
    console.error("[campaigns/schedule GET]", err);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

// POST — create a new scheduled campaign
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const {
      name, template_name, template_language = "en",
      scheduled_at, timezone = "UTC",
      recipients_filter = {}, recipient_count = 0,
      is_recurring = false, recurrence_rule,
    } = body;

    if (!name || !template_name) {
      return NextResponse.json({ error: "name and template_name are required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("campaign_schedules")
      .insert({
        workspace_id: workspaceId,
        name,
        template_name,
        template_language,
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : null,
        timezone,
        recipients_filter,
        recipient_count,
        is_recurring,
        recurrence_rule: recurrence_rule ?? null,
        status: scheduled_at ? "scheduled" : "draft",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ schedule: data }, { status: 201 });
  } catch (err) {
    console.error("[campaigns/schedule POST]", err);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

// PATCH — update schedule status
export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { id, status, scheduled_at } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (scheduled_at) update.scheduled_at = new Date(scheduled_at).toISOString();

    const { data, error } = await admin
      .from("campaign_schedules")
      .update(update)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ schedule: data });
  } catch (err) {
    console.error("[campaigns/schedule PATCH]", err);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

// DELETE — cancel scheduled campaign
export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    await admin.from("campaign_schedules")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[campaigns/schedule DELETE]", err);
    return NextResponse.json({ error: "Failed to cancel schedule" }, { status: 500 });
  }
}
