import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant()
    const { getWhatsAppCredentials } = await import("@/lib/whatsapp/auth")

    let wabaId = ""
    let token = ""
    
    try {
      const creds = await getWhatsAppCredentials(workspaceId, await createAdminClient())
      wabaId = creds.wabaId
      token = creds.accessToken
    } catch (e: any) {
      console.error("[templates GET] Failed to get credentials:", e)
      return NextResponse.json(
        { error: e.message || "WhatsApp not configured." },
        { status: 400 }
      )
    }

    if (!wabaId || !token) {
      return NextResponse.json(
        { error: "WhatsApp not configured. Add META_WABA_ID and META_ACCESS_TOKEN." },
        { status: 400 }
      )
    }

    const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates?limit=100&fields=name,status,language,category,components`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 }, // cache 5 min
    })

    if (!res.ok) {
      const err = await res.json()
      console.error("[templates GET] Meta API error:", err)
      return NextResponse.json({ error: "Meta API error", detail: err }, { status: 502 })
    }

    const raw = await res.json()
    const templates = (raw.data ?? [])
      .filter((t: any) => t.status === "APPROVED")
      .map((t: any) => {
        // Parse button components for branch auto-generation
        const buttonComp = (t.components ?? []).find((c: any) => c.type === "BUTTONS")
        const bodyComp   = (t.components ?? []).find((c: any) => c.type === "BODY")
        const headerComp = (t.components ?? []).find((c: any) => c.type === "HEADER")

        const buttons = (buttonComp?.buttons ?? []).map((b: any) => ({
          type:    b.type,        // QUICK_REPLY | URL | PHONE_NUMBER
          text:    b.text,
          url:     b.url ?? null,
          phone:   b.phone_number ?? null,
        }))

        return {
          name:         t.name,
          language:     t.language,
          display_name: t.name.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          category:     t.category,
          // Full components preserved for variable mapping
          components:   t.components ?? [],
          // Convenience fields
          body_text:    bodyComp?.text ?? "",
          header_type:  headerComp?.format ?? null,   // TEXT | IMAGE | VIDEO | DOCUMENT
          header_text:  headerComp?.text ?? null,
          buttons,
          has_buttons:  buttons.length > 0,
          button_count: buttons.length,
        }
      })

    return NextResponse.json(templates)
  } catch (err: any) {
    console.error("[templates GET]", err)
    return NextResponse.json({ error: err.message ?? "Failed to fetch templates" }, { status: 500 })
  }
}