import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

// POST /api/inbox/upload-media
// Accepts a multipart/form-data with a `file` field.
// Uploads to Meta's media API and returns the media_id + type.
// The returned media_id is passed back to POST /api/inbox/threads/[id]/messages.
//
// Body (FormData):
//   file: File
//
// Response:
//   { media_id: string, type: "image" | "document" | "audio" | "video" }

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant()

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 })
    }

    // Determine WhatsApp media type from MIME type
    const mimeType = file.type
    let waType: "image" | "document" | "audio" | "video" = "document"

    if (mimeType.startsWith("image/")) waType = "image"
    else if (mimeType.startsWith("audio/") || mimeType === "application/ogg") waType = "audio"
    else if (mimeType.startsWith("video/")) waType = "video"

    // Get workspace WhatsApp credentials
    const admin = await createAdminClient()
    const { data: conn } = await admin
      .from("channel_connections")
      .select("config")
      .eq("workspace_id", workspaceId)
      .eq("type", "whatsapp")
      .single()

    const phoneNumId = (conn?.config as any)?.phoneNumberId ?? process.env.META_PHONE_NUMBER_ID
    const token = (conn?.config as any)?.accessToken ?? process.env.META_ACCESS_TOKEN

    if (!phoneNumId || !token) {
      return NextResponse.json({ error: "WhatsApp credentials not configured" }, { status: 400 })
    }

    // Upload to Meta Media API
    const uploadForm = new FormData()
    uploadForm.append("file", file, file.name)
    uploadForm.append("type", mimeType)
    uploadForm.append("messaging_product", "whatsapp")

    const uploadRes = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: uploadForm,
      }
    )

    const uploadData = await uploadRes.json()

    if (!uploadRes.ok || !uploadData.id) {
      console.error("[upload-media] Meta upload failed:", uploadData)
      return NextResponse.json(
        { error: uploadData?.error?.message ?? "Upload failed" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      media_id: uploadData.id,
      type: waType,
      mime_type: mimeType,
      file_name: file.name,
      file_size: file.size,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Upload failed" }, { status: 500 })
  }
}
