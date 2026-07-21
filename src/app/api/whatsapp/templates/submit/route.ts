import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"
import { getTenant } from "@/lib/tenant"
import { buildMetaTemplatePayload } from "@/lib/whatsapp/template-components"
import { submitMessageTemplate } from "@/lib/whatsapp/meta-api"
import { validateTemplatePayload } from "@/lib/whatsapp/template-validators"

export const dynamic = "force-dynamic"

/**
 * POST /api/whatsapp/templates/submit
 * Validates, submits a new template to Meta, and saves it locally.
 */
export async function POST(req: NextRequest) {
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

    const body = await req.json()

    // Validate the payload — throws on invalid input
    try {
      validateTemplatePayload(body)
    } catch (ve: any) {
      return NextResponse.json({ error: ve.message ?? "Validation failed" }, { status: 422 })
    }

    const { wabaId, accessToken } = creds

    if (!wabaId) {
      // Dry run — save locally without calling Meta
      const { data: saved, error: saveErr } = await admin
        .from("message_templates")
        .insert({
          workspace_id: workspaceId,
          name: body.name,
          category: body.category,
          language: body.language || "en_US",
          status: "DRAFT",
          body_text: body.body_text,
          footer_text: body.footer_text ?? null,
          header_type: body.header_type ?? null,
          header_content: body.header_content ?? null,
          header_media_url: body.header_media_url ?? null,
          buttons: body.buttons ?? null,
          sample_values: body.sample_values ?? null,
          submission_error: "No WABA ID configured — saved as draft only.",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (saveErr) throw new Error(saveErr.message)
      return NextResponse.json({ ...saved, dry_run: true })
    }

    // Build Meta payload
    const metaPayload = buildMetaTemplatePayload({
      name: body.name,
      category: body.category,
      language: body.language || "en_US",
      body_text: body.body_text,
      footer_text: body.footer_text,
      header_type: body.header_type,
      header_content: body.header_content,
      header_media_url: body.header_media_url,
      header_handle: body.header_handle,
      buttons: body.buttons,
      sample_values: body.sample_values,
    })

    // Submit to Meta
    let metaResult: { id: string; status: string; category?: string }
    let submissionError: string | null = null
    try {
      metaResult = await submitMessageTemplate({ wabaId, accessToken, payload: metaPayload })
    } catch (e: any) {
      submissionError = e.message ?? "Meta submission failed"
      metaResult = { id: "", status: "REJECTED" }
    }

    // Save to DB regardless of Meta outcome
    const { data: saved, error: saveErr } = await admin
      .from("message_templates")
      .insert({
        workspace_id: workspaceId,
        name: body.name,
        category: body.category,
        language: body.language || "en_US",
        status: metaResult.status || "PENDING",
        meta_template_id: metaResult.id || null,
        body_text: body.body_text,
        footer_text: body.footer_text ?? null,
        header_type: body.header_type ?? null,
        header_content: body.header_content ?? null,
        header_media_url: body.header_media_url ?? null,
        buttons: body.buttons ?? null,
        sample_values: body.sample_values ?? null,
        submission_error: submissionError,
        last_submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveErr) throw new Error(saveErr.message)

    if (submissionError) {
      return NextResponse.json(
        { error: submissionError, saved, dry_run: false },
        { status: 422 }
      )
    }

    return NextResponse.json({ ...saved, dry_run: false })
  } catch (err: any) {
    console.error("[templates submit POST]", err)
    return NextResponse.json(
      { error: err.message ?? "Failed to submit template" },
      { status: 500 }
    )
  }
}
