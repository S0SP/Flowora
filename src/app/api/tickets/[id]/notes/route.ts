import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/server";
import { addNote } from "@/services/tickets";

// POST /api/tickets/[id]/notes — add an internal note (not sent to the customer).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenant();
    const { id } = await params;
    const { note } = await req.json();

    if (!note?.trim()) {
      return NextResponse.json({ error: "Note is required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    await addNote(id, ctx.workspaceId, ctx.userId, note.trim(), admin);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
