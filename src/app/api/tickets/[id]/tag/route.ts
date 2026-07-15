import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { tagUser } from "@/services/tickets";

// POST /api/tickets/[id]/tag — tag a colleague for review.
//   body: { user_id: string, reason?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const { user_id, reason } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    await tagUser(id, ctx.workspaceId, user_id, ctx.userId, reason ?? null, admin);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
