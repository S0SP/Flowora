import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { createTicket } from "@/services/tickets";

// GET /api/tickets — list workspace tickets with contact + assignee info.
//   ?status=open&severity=high&assignee=<userId|me|unassigned>&tagged=me
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenant();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const assignee = searchParams.get("assignee");
    const tagged = searchParams.get("tagged");

    const admin = await createAdminClient();

    // "Tagged to me" — resolve ticket ids from ticket_tags first
    let taggedTicketIds: string[] | null = null;
    if (tagged === "me") {
      const { data: tags } = await admin
        .from("ticket_tags")
        .select("ticket_id")
        .eq("workspace_id", ctx.workspaceId)
        .eq("tagged_user_id", ctx.userId);
      taggedTicketIds = (tags ?? []).map((t) => t.ticket_id);
      if (taggedTicketIds.length === 0) return NextResponse.json({ tickets: [] });
    }

    let query = admin
      .from("tickets")
      .select(`
        *,
        contact:contacts(id, full_name, phone),
        thread:threads(id, ai_active)
      `)
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (severity) query = query.eq("severity", severity);
    if (assignee === "me") query = query.eq("assigned_to", ctx.userId);
    else if (assignee === "unassigned") query = query.is("assigned_to", null);
    else if (assignee) query = query.eq("assigned_to", assignee);
    if (taggedTicketIds) query = query.in("id", taggedTicketIds);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich tickets with assignee info from workspace_members
    const assigneeIds = (data ?? [])
      .filter((t) => t.assigned_to)
      .map((t) => t.assigned_to as string);
    const uniqueAssigneeIds = [...new Set(assigneeIds)];

    let memberMap: Record<string, { full_name: string | null; email: string }> = {};
    if (uniqueAssigneeIds.length > 0) {
      const { data: members } = await admin
        .from("workspace_members")
        .select("user_id, full_name, email")
        .eq("workspace_id", ctx.workspaceId)
        .in("user_id", uniqueAssigneeIds);
      memberMap = Object.fromEntries((members ?? []).map((m) => [m.user_id, m]));
    }

    const tickets = (data ?? []).map((t) => ({
      ...t,
      assignee: t.assigned_to ? memberMap[t.assigned_to] ?? null : null,
    }));

    return NextResponse.json({ tickets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: err.status ?? 500 });
  }
}

// POST /api/tickets — manually create a ticket for a contact.
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenant();
    const body = await req.json();

    if (!body.contact_id || !body.subject) {
      return NextResponse.json({ error: "contact_id and subject are required" }, { status: 400 });
    }

    const ticket = await createTicket({
      workspaceId: ctx.workspaceId,
      contactId: body.contact_id,
      threadId: body.thread_id ?? null,
      subject: body.subject,
      description: body.description ?? null,
      severity: body.severity ?? "medium",
      flags: body.flags ?? [],
      source: "manual",
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
