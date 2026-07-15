import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

// GET /api/inbox/threads/[id] — single thread with active ticket
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await getTenant()
    const { id } = await params
    const admin = await createAdminClient()

    const { data: thread, error } = await admin
      .from("threads")
      .select("*, contacts(id, full_name, phone, email, avatar_url)")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single()

    if (error || !thread) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Check for an active ticket on this thread
    const { data: ticket } = await admin
      .from("tickets")
      .select("id, ref, subject, status, severity")
      .eq("thread_id", id)
      .eq("workspace_id", workspaceId)
      .not("status", "in", '("resolved","closed")')
      .maybeSingle()

    return NextResponse.json({ thread, activeTicket: ticket ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/inbox/threads/[id] — update tags, priority, subject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await getTenant()
    const { id } = await params
    const body = await req.json()
    const admin = await createAdminClient()

    // Only allow updating safe fields
    const allowed = ["tags", "priority", "subject"]
    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const { data, error } = await admin
      .from("threads")
      .update(update)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ thread: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
