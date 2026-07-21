import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"
import { getTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

/**
 * POST /api/whatsapp/templates/sync
 * Fetches all templates from Meta and upserts them into message_templates table.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()
    const creds = await getWhatsAppCredentials(workspaceId, admin)

    if (!creds) {
      return NextResponse.json(
        { error: "WhatsApp not configured. Please save credentials in Settings → WhatsApp first." },
        { status: 400 }
      )
    }

    const { accessToken, wabaId } = creds

    if (!wabaId) {
      return NextResponse.json(
        { error: "WhatsApp Business Account ID (WABA ID) is not configured." },
        { status: 400 }
      )
    }

    // Fetch all templates from Meta
    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=250&fields=id,name,status,language,category,quality_score,components,rejection_reason`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      let errMsg = `Meta API error: ${res.status}`
      try {
        const err = await res.json()
        if (err?.error?.message) errMsg = err.error.message
      } catch {}
      return NextResponse.json({ error: errMsg }, { status: 502 })
    }

    const raw = await res.json()
    const metaTemplates: any[] = raw.data ?? []

    let inserted = 0
    let updated = 0

    for (const t of metaTemplates) {
      const bodyComp = (t.components ?? []).find((c: any) => c.type === "BODY")
      const headerComp = (t.components ?? []).find((c: any) => c.type === "HEADER")
      const footerComp = (t.components ?? []).find((c: any) => c.type === "FOOTER")
      const buttonComp = (t.components ?? []).find((c: any) => c.type === "BUTTONS")

      // Map Meta category (MARKETING) → app category (Marketing)
      const categoryMap: Record<string, string> = {
        MARKETING: "Marketing",
        UTILITY: "Utility",
        AUTHENTICATION: "Authentication",
      }

      const row = {
        workspace_id: workspaceId,
        name: t.name,
        category: categoryMap[t.category] ?? t.category,
        language: t.language,
        status: t.status,
        meta_template_id: String(t.id),
        quality_score: t.quality_score?.score ?? null,
        rejection_reason: t.rejection_reason ?? null,
        body_text: bodyComp?.text ?? "",
        footer_text: footerComp?.text ?? null,
        header_type: headerComp ? (headerComp.format?.toLowerCase() ?? "text") : null,
        header_content: headerComp?.format === "TEXT" ? (headerComp.text ?? null) : null,
        header_media_url: null,
        buttons: buttonComp
          ? (buttonComp.buttons ?? []).map((b: any) => ({
              type: b.type,
              text: b.text,
              ...(b.url ? { url: b.url } : {}),
              ...(b.phone_number ? { phone_number: b.phone_number } : {}),
              ...(b.example ? { example: b.example[0] } : {}),
            }))
          : null,
        updated_at: new Date().toISOString(),
      }

      // Check if template already exists
      const { data: existing } = await admin
        .from("message_templates")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", t.name)
        .eq("language", t.language)
        .maybeSingle()

      if (existing) {
        await admin
          .from("message_templates")
          .update(row)
          .eq("id", existing.id)
        updated++
      } else {
        await admin
          .from("message_templates")
          .insert({ ...row, created_at: new Date().toISOString() })
        inserted++
      }
    }

    return NextResponse.json({
      success: true,
      total: metaTemplates.length,
      inserted,
      updated,
    })
  } catch (err: any) {
    console.error("[templates sync POST]", err)
    return NextResponse.json(
      { error: err.message ?? "Failed to sync templates" },
      { status: 500 }
    )
  }
}
