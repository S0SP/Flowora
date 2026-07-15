import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { agentReply } from "@/services/tickets";

// POST /api/tickets/[id]/reply — agent sends a WhatsApp reply to the customer.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const { message } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const { data: ticket } = await admin
      .from("tickets")
      .select("id, thread_id, contact_id")
      .eq("id", id)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!ticket || !ticket.thread_id) {
      return NextResponse.json({ error: "Ticket not found or has no linked thread" }, { status: 404 });
    }

    const saved = await agentReply(
      id,
      ctx.workspaceId,
      ctx.userId,
      ticket.contact_id,
      ticket.thread_id,
      message.trim(),
      admin
    );

    return NextResponse.json({ success: true, message: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed to send" }, { status: 500 });
  }
}
