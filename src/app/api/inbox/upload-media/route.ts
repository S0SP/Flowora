import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"

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
    const credentials = await getWhatsAppCredentials(workspaceId, admin)

    const phoneNumId = credentials?.phoneNumberId
    const token = credentials?.accessToken

    if (!phoneNumId || !token) {
      return NextResponse.json({ error: "WhatsApp credentials not configured" }, { status: 400 })
    }

    // Upload to Meta Media API
    const { uploadMedia } = await import("@/lib/whatsapp/meta-api");
    let uploadData: { id: string };

    try {
      uploadData = await uploadMedia({
        phoneNumberId: phoneNumId,
        accessToken: token,
        file: file,
        filename: file.name,
        mimeType: mimeType,
      });
    } catch (err: any) {
      console.error("[upload-media] Meta upload failed:", err.message);
      return NextResponse.json(
        { error: err.message ?? "Upload failed" },
        { status: 500 }
      );
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
