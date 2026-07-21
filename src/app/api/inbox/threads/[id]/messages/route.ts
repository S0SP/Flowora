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
        const { sendTextMessage, sendMediaMessage, sendTemplateMessage } = await import("@/lib/whatsapp/meta-api")

        try {
          if (type === "text") {
            const result = await sendTextMessage({
              phoneNumberId: phoneNumId,
              accessToken: token,
              to,
              text: content.trim(),
            })
            waMessageId = result.messageId
          } else if (type === "template" && templateName) {
            const result = await sendTemplateMessage({
              phoneNumberId: phoneNumId,
              accessToken: token,
              to,
              templateName: templateName,
              language: templateLanguage ?? "en",
              params: components?.[0]?.parameters?.map((p: any) => p.text) || undefined,
            })
            waMessageId = result.messageId
          } else if (["image", "document", "audio", "video"].includes(type) && mediaId) {
            const result = await sendMediaMessage({
              phoneNumberId: phoneNumId,
              accessToken: token,
              to,
              kind: type as any,
              id: mediaId,
              caption: content.trim() ? content.trim() : undefined,
              filename: type === "document" ? (fileName ?? "file") : undefined,
            })
            waMessageId = result.messageId
          } else {
            // fallback: text
            const result = await sendTextMessage({
              phoneNumberId: phoneNumId,
              accessToken: token,
              to,
              text: content.trim(),
            })
            waMessageId = result.messageId
          }
        } catch (err: any) {
          console.error("[inbox/messages] Meta error:", err.message)
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
