import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveTicket, reopenTicket } from "@/services/tickets";

// POST /api/tickets/[id]/resolve — resolve, close, or reopen a ticket.
//   body: { action: "resolve" | "close" | "reopen" }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const { action } = await req.json();
    const admin = await createAdminClient();

    if (action === "reopen") {
      await reopenTicket(id, ctx.workspaceId, ctx.userId, admin);
    } else {
      await resolveTicket(id, ctx.workspaceId, ctx.userId, action === "close", admin);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
