import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"

// GET /api/inbox/threads/[id]/messages
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId } = await getTenant()
    const { id: threadId } = await params
    const admin = await createAdminClient()

    const { data, error } = await admin
      .from("messages")
      .select("id, content, type, sender_type, sender_id, status, created_at, metadata, file_url, file_name, file_size, wa_message_id")
      .eq("workspace_id", workspaceId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Mark thread as read
    await admin.from("threads")
      .update({ unread_count: 0 })
      .eq("id", threadId)
      .eq("workspace_id", workspaceId)

    return NextResponse.json({ messages: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/inbox/threads/[id]/messages — send a message via WhatsApp
// Supports: text, image, document, audio, video, note (internal only)
// Body:
//   text:     { content, type?: "text", isNote?: false }
//   media:    { content?: caption, type: "image"|"document"|"audio"|"video", mediaId: string, fileName?: string }
//   template: { type: "template", templateName, templateLanguage, components? }
//   note:     { content, isNote: true }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspaceId, userId } = await getTenant()
    const { id: threadId } = await params
    const body = await req.json()
    const {
      content = "",
      type = "text",
      isNote = false,
      mediaId,       // Meta media_id from /api/inbox/upload-media
      fileName,      // For document type
      templateName,
      templateLanguage,
      components,
    } = body

    if (!isNote && !content?.trim() && !mediaId && type !== "template") {
      return NextResponse.json({ error: "content or mediaId required" }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Get thread + contact phone + channel connection
    const { data: thread } = await admin
      .from("threads")
      .select("contact_id, channel_connection_id, contacts(phone, full_name)")
      .eq("id", threadId)
      .eq("workspace_id", workspaceId)
      .single()

    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 })

    const contactPhone = (thread.contacts as any)?.phone
    let waMessageId: string | null = null

    // Send via WhatsApp if not a note
    if (!isNote && contactPhone) {
      const credentials = await getWhatsAppCredentials(workspaceId, admin)
      const phoneNumId = credentials?.phoneNumberId
      let token = credentials?.accessToken

      if (phoneNumId && token) {
        const to = contactPhone.replace(/\D/g, "")
        let waPayload: Record<string, any> = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
        }

        if (type === "text") {
          waPayload.type = "text"
          waPayload.text = { body: content.trim(), preview_url: false }
        } else if (type === "image" && mediaId) {
          waPayload.type = "image"
          waPayload.image = { id: mediaId, ...(content.trim() ? { caption: content.trim() } : {}) }
        } else if (type === "document" && mediaId) {
          waPayload.type = "document"
          waPayload.document = { id: mediaId, filename: fileName ?? "file", ...(content.trim() ? { caption: content.trim() } : {}) }
        } else if (type === "audio" && mediaId) {
          waPayload.type = "audio"
          waPayload.audio = { id: mediaId }
        } else if (type === "video" && mediaId) {
          waPayload.type = "video"
          waPayload.video = { id: mediaId, ...(content.trim() ? { caption: content.trim() } : {}) }
        } else if (type === "template" && templateName) {
          waPayload.type = "template"
          waPayload.template = {
            name: templateName,
            language: { code: templateLanguage ?? "en" },
            ...(components ? { components } : {}),
          }
        } else {
          // fallback: text
          waPayload.type = "text"
          waPayload.text = { body: content.trim(), preview_url: false }
        }

        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneNumId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(waPayload),
        })
        const metaData = await metaRes.json()
        if (metaRes.ok) {
          waMessageId = metaData.messages?.[0]?.id ?? null
        } else {
          console.error("[inbox/messages] Meta error:", metaData)
        }
      }
    }

    // Determine sender and status
    const senderType = isNote ? "system" : "agent"
    const status = isNote ? "delivered" : (waMessageId ? "sent" : "failed")

    // Save message
    const { data: msg, error: insertErr } = await admin.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: threadId,
      wa_message_id: waMessageId,
      content: content.trim() || null,
      type: type === "document" ? "file" : type,
      sender_type: senderType,
      sender_id: userId,
      status,
      file_name: fileName ?? null,
      metadata: {
        ...(isNote ? { is_note: true } : {}),
        ...(mediaId ? { media_id: mediaId } : {}),
        ...(body.followupDate ? { followup_date: body.followupDate, followup_completed: false } : {}),
      },
    }).select("id, content, type, sender_type, created_at, status, metadata, file_name").single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    // Update thread last message preview
    const preview = type === "text"
      ? (content.trim().slice(0, 100) || "")
      : type === "image" ? "📷 Image"
      : type === "document" ? `📄 ${fileName ?? "Document"}`
      : type === "audio" ? "🎵 Audio"
      : type === "video" ? "🎥 Video"
      : content.trim().slice(0, 100)

    await admin.from("threads").update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
    }).eq("id", threadId)

    return NextResponse.json({ message: msg }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
