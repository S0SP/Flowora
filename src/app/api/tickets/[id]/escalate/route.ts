import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { escalateTicket } from "@/services/tickets";

// POST /api/tickets/[id]/escalate — escalate the ticket for admin review.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const { reason } = await req.json();
    const admin = await createAdminClient();

    await escalateTicket(
      id,
      ctx.workspaceId,
      ctx.userId,
      reason || "Escalated for admin review",
      admin
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
