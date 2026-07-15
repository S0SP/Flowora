import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { assignTicket, setTicketStatus } from "@/services/tickets";
import type { TicketStatus } from "@/services/tickets";

// GET /api/tickets/[id] — full ticket bundle for the detail view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const admin = await createAdminClient();

    const { data: ticket, error } = await admin
      .from("tickets")
      .select(`*, contact:contacts(*), thread:threads(id, ai_active)`)
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (error || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const [{ data: messages }, { data: events }, { data: tags }, { data: members }] =
      await Promise.all([
        // Messages from the linked thread
        ticket.thread_id
          ? admin
              .from("messages")
              .select("*")
              .eq("thread_id", ticket.thread_id)
              .eq("workspace_id", ctx.workspaceId)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        admin
          .from("ticket_events")
          .select("*")
          .eq("ticket_id", id)
          .order("created_at", { ascending: true }),
        admin
          .from("ticket_tags")
          .select("*")
          .eq("ticket_id", id),
        admin
          .from("workspace_members")
          .select("id, user_id, full_name, email, role")
          .eq("workspace_id", ctx.workspaceId)
          .eq("status", "active")
          .order("full_name", { ascending: true }),
      ]);

    // Enrich events with actor names
    const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean))];
    const actorMap: Record<string, { full_name: string | null; email: string }> = {};
    if (actorIds.length > 0) {
      (members ?? []).forEach((m) => {
        if (m.user_id) actorMap[m.user_id] = { full_name: m.full_name, email: m.email };
      });
    }

    const enrichedEvents = (events ?? []).map((e) => ({
      ...e,
      actor: e.actor_id ? actorMap[e.actor_id] ?? null : null,
    }));

    // Enrich tags with tagged user names
    const taggedIds = [...new Set((tags ?? []).map((t) => t.tagged_user_id))];
    const taggedMap: Record<string, { full_name: string | null; email: string }> = {};
    if (taggedIds.length > 0) {
      (members ?? []).forEach((m) => {
        if (m.user_id) taggedMap[m.user_id] = { full_name: m.full_name, email: m.email };
      });
    }
    const enrichedTags = (tags ?? []).map((t) => ({
      ...t,
      tagged: taggedMap[t.tagged_user_id] ?? null,
    }));

    // Mark current user's tags as read
    await admin
      .from("ticket_tags")
      .update({ is_read: true })
      .eq("ticket_id", id)
      .eq("tagged_user_id", ctx.userId)
      .eq("is_read", false);

    // Enrich ticket with assignee
    const assignee = ticket.assigned_to
      ? (members ?? []).find((m) => m.user_id === ticket.assigned_to) ?? null
      : null;

    return NextResponse.json({
      ticket: { ...ticket, assignee },
      messages: messages ?? [],
      events: enrichedEvents,
      tags: enrichedTags,
      agents: members ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: err.status ?? 500 });
  }
}

// PATCH /api/tickets/[id] — assign / change status / severity.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const body = await req.json();
    const admin = await createAdminClient();

    if (typeof body.assigned_to === "string") {
      await assignTicket(id, ctx.workspaceId, body.assigned_to, ctx.userId, admin);
    }
    if (typeof body.status === "string") {
      await setTicketStatus(id, ctx.workspaceId, body.status as TicketStatus, ctx.userId, admin);
    }
    if (typeof body.severity === "string") {
      await admin
        .from("tickets")
        .update({ severity: body.severity })
        .eq("id", id)
        .eq("workspace_id", ctx.workspaceId);
      await admin.from("ticket_events").insert({
        ticket_id: id,
        workspace_id: ctx.workspaceId,
        actor_id: ctx.userId,
        event_type: "status_changed",
        to_value: `severity:${body.severity}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
