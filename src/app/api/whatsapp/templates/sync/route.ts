import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { getMetaTemplates } from "@/services/meta"

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

    // Fetch all templates from Meta using the meta service
    const metaTemplates = await getMetaTemplates(workspaceId);

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
        const { error } = await admin
          .from("message_templates")
          .update(row)
          .eq("id", existing.id)
        if (error) {
          console.error(`Failed to update template ${t.name}:`, error)
          throw error
        }
        updated++
      } else {
        const { error } = await admin
          .from("message_templates")
          .insert({ ...row, created_at: new Date().toISOString() })
        if (error) {
          console.error(`Failed to insert template ${t.name}:`, error)
          throw error
        }
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
