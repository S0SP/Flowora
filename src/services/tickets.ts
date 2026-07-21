import { createAdminClient } from "@/lib/supabase/server";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminClient>>;

async function client(c?: SupabaseAdmin) {
  return c ?? (await createAdminClient());
}

export type TicketSeverity = "low" | "medium" | "high" | "critical";
export type TicketStatus = "open" | "assigned" | "in_progress" | "escalated" | "resolved" | "closed";
export type TicketSource = "ai_escalation" | "manual";

export interface CreateTicketInput {
  workspaceId: string;
  threadId?: string | null;
  contactId: string;
  subject: string;
  description?: string | null;
  severity?: TicketSeverity;
  flags?: string[];
  source?: TicketSource;
  escalationReason?: string | null;
  anchorMessageId?: string | null;
  createdBy?: string | null;       // workspace_members.user_id; NULL = AI/system
  sendHoldingMessage?: boolean;
  holdingMessage?: string;
}

/**
 * Create a ticket, pause AI on the thread, record the creation event,
 * and (optionally) send a WhatsApp holding message. Idempotent: if an
 * open ticket already exists for the thread, returns it without creating.
 */
export async function createTicket(input: CreateTicketInput, c?: SupabaseAdmin) {
  const supabase = await client(c);

  // Return existing open ticket for this thread
  if (input.threadId) {
    const { data: existing } = await supabase
      .from("tickets")
      .select("*")
      .eq("thread_id", input.threadId)
      .eq("workspace_id", input.workspaceId)
      .not("status", "in", '("resolved","closed")')
      .maybeSingle();
    if (existing) return existing;
  }

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      workspace_id: input.workspaceId,
      thread_id: input.threadId ?? null,
      contact_id: input.contactId,
      subject: input.subject.slice(0, 200),
      description: input.description ?? null,
      severity: input.severity ?? "medium",
      flags: input.flags ?? [],
      source: input.source ?? "ai_escalation",
      escalation_reason: input.escalationReason ?? null,
      anchor_message_id: input.anchorMessageId ?? null,
      created_by: input.createdBy ?? null,
      status: "open",
    })
    .select()
    .single();

  if (error || !ticket) throw new Error(error?.message ?? "Failed to create ticket");

  // Pause AI for the conversation thread
  if (input.threadId) {
    await supabase
      .from("threads")
      .update({ ai_active: false })
      .eq("id", input.threadId)
      .eq("workspace_id", input.workspaceId);
  }

  // Record creation event
  await supabase.from("ticket_events").insert({
    ticket_id: ticket.id,
    workspace_id: input.workspaceId,
    actor_id: input.createdBy ?? null,
    event_type: "created",
    to_value: ticket.status,
    note: input.escalationReason ?? null,
    metadata: { source: ticket.source, flags: ticket.flags, severity: ticket.severity },
  });

  // Optional holding message to the customer via WhatsApp
  if (input.sendHoldingMessage && input.holdingMessage && input.threadId) {
    try {
      const ticketCode = `TKT-${ticket.id.split("-")[0].toUpperCase()}`;
      const finalMessage = `${input.holdingMessage}\n\nTicket Reference: ${ticketCode}`;
      await _sendWhatsAppViaWorkspace(
        supabase, input.workspaceId, input.contactId, input.threadId, ticket.id, finalMessage
      );
    } catch (err) {
      console.error("[tickets] Holding message failed:", err);
    }
  }

  return ticket;
}

/** Assign / reassign a ticket to a workspace member (by user_id). */
export async function assignTicket(
  ticketId: string,
  workspaceId: string,
  assigneeUserId: string,
  actorUserId: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  const { data: prev } = await supabase
    .from("tickets")
    .select("assigned_to, status")
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId)
    .single();

  const isReassign = !!prev?.assigned_to && prev.assigned_to !== assigneeUserId;
  const nextStatus: TicketStatus =
    prev?.status === "open" ? "assigned" : (prev?.status as TicketStatus) ?? "assigned";

  await supabase
    .from("tickets")
    .update({ assigned_to: assigneeUserId, status: nextStatus })
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId);

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: isReassign ? "reassigned" : "assigned",
    from_value: prev?.assigned_to ?? null,
    to_value: assigneeUserId,
  });
}

/** Change ticket status. */
export async function setTicketStatus(
  ticketId: string,
  workspaceId: string,
  status: TicketStatus,
  actorUserId: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  const { data: prev } = await supabase
    .from("tickets")
    .select("status")
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId)
    .single();

  await supabase
    .from("tickets")
    .update({ status })
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId);

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: "status_changed",
    from_value: prev?.status ?? null,
    to_value: status,
  });
}

/** Escalate a ticket for admin review. */
export async function escalateTicket(
  ticketId: string,
  workspaceId: string,
  actorUserId: string,
  reason: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  await supabase
    .from("tickets")
    .update({ status: "escalated" })
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId);

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: "escalated",
    to_value: "escalated",
    note: reason,
  });
}

/** Tag a colleague for review. */
export async function tagUser(
  ticketId: string,
  workspaceId: string,
  taggedUserId: string,
  taggedBy: string,
  reason: string | null,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  await supabase.from("ticket_tags").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    tagged_user_id: taggedUserId,
    tagged_by: taggedBy,
    reason,
  });

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: taggedBy,
    event_type: "tagged",
    to_value: taggedUserId,
    note: reason,
  });
}

/** Add an internal note (not sent to the customer). */
export async function addNote(
  ticketId: string,
  workspaceId: string,
  actorUserId: string,
  note: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: "commented",
    note,
  });
}

/**
 * Resolve or close a ticket. Re-enables AI on the thread so the chatbot
 * resumes for the next inbound message.
 */
export async function resolveTicket(
  ticketId: string,
  workspaceId: string,
  actorUserId: string,
  close: boolean,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  const now = new Date().toISOString();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("thread_id, status")
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId)
    .single();

  const status: TicketStatus = close ? "closed" : "resolved";
  await supabase
    .from("tickets")
    .update({
      status,
      resolved_by: actorUserId,
      resolved_at: now,
      ...(close ? { closed_at: now } : {}),
    })
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId);

  // Re-enable AI on the conversation thread
  if (ticket?.thread_id) {
    await supabase
      .from("threads")
      .update({ ai_active: true })
      .eq("id", ticket.thread_id)
      .eq("workspace_id", workspaceId);
  }

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: close ? "closed" : "resolved",
    from_value: ticket?.status ?? null,
    to_value: status,
  });
}

/** Reopen a resolved/closed ticket and pause AI again. */
export async function reopenTicket(
  ticketId: string,
  workspaceId: string,
  actorUserId: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);
  const { data: ticket } = await supabase
    .from("tickets")
    .select("thread_id, status")
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId)
    .single();

  await supabase
    .from("tickets")
    .update({ status: "in_progress", resolved_at: null, closed_at: null })
    .eq("id", ticketId)
    .eq("workspace_id", workspaceId);

  if (ticket?.thread_id) {
    await supabase
      .from("threads")
      .update({ ai_active: false })
      .eq("id", ticket.thread_id)
      .eq("workspace_id", workspaceId);
  }

  await supabase.from("ticket_events").insert({
    ticket_id: ticketId,
    workspace_id: workspaceId,
    actor_id: actorUserId,
    event_type: "reopened",
    from_value: ticket?.status ?? null,
    to_value: "in_progress",
  });
}

/**
 * Agent sends a WhatsApp reply within a ticket. Logs the message to the
 * thread and bumps the ticket to in_progress if it was open/assigned.
 */
export async function agentReply(
  ticketId: string,
  workspaceId: string,
  agentUserId: string,
  contactId: string,
  threadId: string,
  message: string,
  c?: SupabaseAdmin
) {
  const supabase = await client(c);

  const sent = await _sendWhatsAppViaWorkspace(
    supabase, workspaceId, contactId, threadId, ticketId, message, agentUserId
  );

  // Bump to in_progress once agent engages
  const { data: t } = await supabase
    .from("tickets")
    .select("status")
    .eq("id", ticketId)
    .single();
  if (t && (t.status === "open" || t.status === "assigned")) {
    await supabase
      .from("tickets")
      .update({ status: "in_progress" })
      .eq("id", ticketId)
      .eq("workspace_id", workspaceId);
  }

  return sent;
}

// ── Internal helper: send WhatsApp via workspace channel_connections ─────────

import { getWhatsAppCredentials } from "@/lib/whatsapp/auth";

async function _sendWhatsAppViaWorkspace(
  supabase: SupabaseAdmin,
  workspaceId: string,
  contactId: string,
  threadId: string,
  ticketId: string,
  message: string,
  senderUserId?: string
) {
  const credentials = await getWhatsAppCredentials(workspaceId, supabase);
  
  const { data: contact } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", contactId)
    .single();

  if (!credentials?.phoneNumberId || !credentials?.accessToken || !contact?.phone) {
    throw new Error("Missing WhatsApp credentials or contact phone");
  }

  const phoneNumId = credentials.phoneNumberId;
  const token = credentials.accessToken;

  const { sendTextMessage } = await import("@/lib/whatsapp/meta-api");
  const result = await sendTextMessage({
    phoneNumberId: phoneNumId,
    accessToken: token,
    to: contact.phone,
    text: message,
  });

  const { data: saved } = await supabase
    .from("messages")
    .insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      ticket_id: ticketId,
      wa_message_id: result.messageId ?? null,
      content: message,
      type: "text",
      sender_type: senderUserId ? "agent" : "system",
      sender_id: senderUserId ?? null,
      status: "sent",
    })
    .select()
    .single();

  await supabase
    .from("threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message.slice(0, 100),
    })
    .eq("id", threadId);

  return saved;
}
