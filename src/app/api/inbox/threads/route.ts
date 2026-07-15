import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

// GET /api/inbox/threads — paginated thread list with filters
export async function GET(req: NextRequest) {
  try {
    const { workspaceId, userId } = await getTenant()
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") ?? "1")
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100)
    
    // Tab filters
    const status = searchParams.get("status") ?? ""
    const aiOnly = searchParams.get("ai") === "true"
    const unreadOnly = searchParams.get("unread") === "true"
    const assignedOnly = searchParams.get("assigned") === "true"
    
    // Advanced filters
    const search = searchParams.get("search") ?? ""
    const filterStatus = searchParams.get("filterStatus") ?? ""
    const filterAssignedTo = searchParams.get("filterAssignedTo") ?? ""
    const tagsParam = searchParams.get("tags") ?? ""
    const followups = searchParams.get("followups") ?? ""
    const startDate = searchParams.get("startDate") ?? ""
    const endDate = searchParams.get("endDate") ?? ""
    
    const offset = (page - 1) * limit
    const admin = await createAdminClient()
    
    // Handle followups filter via subquery
    let followupThreadIds: string[] = []
    if (followups === "has_followup" || followups === "no_followup") {
      const { data: fMsgs } = await admin
        .from("messages")
        .select("thread_id")
        .eq("workspace_id", workspaceId)
        .eq("metadata->>is_note", "true")
        .not("metadata->followup_completed", "eq", true)
      
      followupThreadIds = Array.from(new Set((fMsgs || []).map(m => m.thread_id).filter(Boolean))) as string[];
    }

    // Handle tag filtering cross-table (threads OR contacts)
    let matchedContactIdsForTags: string[] = []
    let tagsArray: string[] = []
    if (tagsParam) {
      tagsArray = tagsParam.split(",").map(t => t.trim()).filter(Boolean)
      if (tagsArray.length > 0) {
        const { data: matchedContacts } = await admin
          .from("contacts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .contains("tags", tagsArray)
        
        matchedContactIdsForTags = (matchedContacts || []).map(c => c.id)
      }
    }

    let query = admin
      .from("threads")
      .select(`
        id, status, channel, assigned_to, ai_active, unread_count,
        last_message_at, last_message_preview, tags, priority,
        contacts!inner(id, full_name, phone, email, avatar_url, tags)
      `, { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    // Apply search filter (relies on contacts!inner)
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`, { foreignTable: "contacts" })
    }

    // Apply basic/tab filters
    const finalStatus = filterStatus || status
    if (finalStatus && finalStatus !== "all") query = query.eq("status", finalStatus)
    if (aiOnly) query = query.eq("ai_active", true)
    if (unreadOnly) query = query.gt("unread_count", 0)
    if (assignedOnly) query = query.not("assigned_to", "is", null)

    // Apply filterAssignedTo
    if (filterAssignedTo === "my") query = query.eq("assigned_to", userId)
    else if (filterAssignedTo === "others") query = query.neq("assigned_to", userId).not("assigned_to", "is", null)
    else if (filterAssignedTo === "unassigned") query = query.is("assigned_to", null)

    // Apply date range
    if (startDate) query = query.gte("last_message_at", startDate)
    if (endDate) query = query.lte("last_message_at", endDate)

    // Apply followups filter
    if (followups === "has_followup") {
      if (followupThreadIds.length > 0) query = query.in("id", followupThreadIds)
      else query = query.eq("id", "00000000-0000-0000-0000-000000000000") // Force empty if no followups exist
    } else if (followups === "no_followup") {
      if (followupThreadIds.length > 0) query = query.not("id", "in", `(${followupThreadIds.join(',')})`)
    }

    // Apply tags filter
    if (tagsArray.length > 0) {
      if (matchedContactIdsForTags.length > 0) {
        query = query.or(`tags.cs.{${tagsArray.join(',')}},contact_id.in.(${matchedContactIdsForTags.join(',')})`)
      } else {
        query = query.contains("tags", tagsArray)
      }
    }

    const { data, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ threads: data ?? [], total: count ?? 0, page, limit })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: 500 })
  }
}

// POST /api/inbox/threads — create outbound conversation
export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId } = await getTenant()
    const body = await req.json()
    const { contactId, channel, initialMessage } = body

    if (!contactId || !channel) {
      return NextResponse.json({ error: "contactId and channel required" }, { status: 400 })
    }

    const admin = await createAdminClient()
    const { data: thread, error } = await admin.from("threads").insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      channel,
      status: "open",
      assigned_to: userId,
      ai_active: false,
    }).select("id").single()

    if (error || !thread) return NextResponse.json({ error: error?.message }, { status: 500 })

    if (initialMessage) {
      await admin.from("messages").insert({
        workspace_id: workspaceId,
        thread_id: thread.id,
        content: initialMessage,
        sender_type: "agent",
        sender_id: userId,
        type: "text",
        status: "sent",
      })
    }

    return NextResponse.json({ threadId: thread.id }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Failed" }, { status: 500 })
  }
}
