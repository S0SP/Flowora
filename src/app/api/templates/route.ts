import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()

    // Get workspace Meta credentials
    const { data: conn } = await admin
      .from("channel_connections")
      .select("config, secrets_enc")
      .eq("workspace_id", workspaceId)
      .eq("type", "whatsapp")
      .maybeSingle()

    const config = conn?.config as any
    const wabaId = config?.wabaId ?? config?.waba_id ?? process.env.META_WABA_ID ?? ""
    
    let token = process.env.META_ACCESS_TOKEN ?? ""
    if (conn?.secrets_enc) {
      try {
        const { decrypt } = await import("@/lib/crypto")
        const secretsObj = JSON.parse(conn.secrets_enc)
        if (secretsObj.accessToken) {
          token = await decrypt(secretsObj.accessToken)
        }
      } catch (e) {
        console.error("[templates GET] Failed to decrypt access token:", e)
      }
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