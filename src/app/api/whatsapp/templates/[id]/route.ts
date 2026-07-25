import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"
import { getTenant } from "@/lib/tenant"
import { buildMetaTemplatePayload } from "@/lib/whatsapp/template-components"
import {
  editMessageTemplate,
  deleteMessageTemplate,
} from "@/lib/whatsapp/meta-api"
import { validateTemplatePayload } from "@/lib/whatsapp/template-validators"

export const dynamic = "force-dynamic"

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/whatsapp/templates/[id]
 * Edit an existing approved template on Meta and update locally.
 */
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  try {
    const { id } = await params;
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()

    // Fetch the existing local template
    const { data: existing, error: fetchErr } = await admin
      .from("message_templates")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const body = await req.json()

    // Merge with existing so name/language stay fixed (Meta rule: can't change after creation)
    const merged = {
      name: existing.name,
      category: body.category ?? existing.category,
      language: existing.language,
      header_type: body.header_type ?? existing.header_type,
      header_content: body.header_content ?? existing.header_content,
      header_media_url: body.header_media_url ?? existing.header_media_url,
      header_handle: body.header_handle ?? existing.header_handle,
      body_text: body.body_text ?? existing.body_text,
      footer_text: body.footer_text ?? existing.footer_text,
      buttons: body.buttons ?? existing.buttons,
      sample_values: body.sample_values ?? existing.sample_values,
    }

    // Validate
    try {
      validateTemplatePayload(merged)
    } catch (ve: any) {
      return NextResponse.json({ error: ve.message ?? "Validation failed" }, { status: 422 })
    }

    const creds = await getWhatsAppCredentials(workspaceId, admin)
    let submissionError: string | null = null

    if (creds && existing.meta_template_id) {
      const metaPayload = buildMetaTemplatePayload(merged)
      try {
        await editMessageTemplate({
          metaTemplateId: existing.meta_template_id,
          accessToken: creds.accessToken,
          components: metaPayload.components,
          category: metaPayload.category,
        })
      } catch (e: any) {
        submissionError = e.message ?? "Meta edit failed"
      }
    }

    // Update local DB
    const { data: updated, error: updateErr } = await admin
      .from("message_templates")
      .update({
        category: merged.category,
        body_text: merged.body_text,
        footer_text: merged.footer_text ?? null,
        header_type: merged.header_type ?? null,
        header_content: merged.header_content ?? null,
        header_media_url: merged.header_media_url ?? null,
        buttons: merged.buttons ?? null,
        sample_values: merged.sample_values ?? null,
        status: submissionError ? existing.status : "PENDING",
        submission_error: submissionError,
        last_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single()

    if (updateErr) throw new Error(updateErr.message)

    if (submissionError) {
      return NextResponse.json({ error: submissionError, saved: updated }, { status: 422 })
    }

    return NextResponse.json({ ...updated, dry_run: !creds || !existing.meta_template_id })
  } catch (err: any) {
    console.error("[templates PATCH]", err)
    return NextResponse.json(
      { error: err.message ?? "Failed to edit template" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/whatsapp/templates/[id]
 * Delete a template on Meta and remove it locally.
 */
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  try {
    const { id } = await params;
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()

    // Fetch existing to get meta_template_id and name
    const { data: existing, error: fetchErr } = await admin
      .from("message_templates")
      .select("id, name, meta_template_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Try to delete from Meta (best-effort — don't fail if creds missing)
    const creds = await getWhatsAppCredentials(workspaceId, admin)
    if (creds && creds.wabaId) {
      try {
        await deleteMessageTemplate({
          wabaId: creds.wabaId,
          accessToken: creds.accessToken,
          name: existing.name,
          metaTemplateId: existing.meta_template_id ?? undefined,
        })
      } catch (e: any) {
        console.warn("[templates DELETE] Meta delete failed (will still remove locally):", e.message)
      }
    }

    // Delete from local DB
    const { error: deleteErr } = await admin
      .from("message_templates")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId)

    if (deleteErr) throw new Error(deleteErr.message)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[templates DELETE]", err)
    return NextResponse.json(
      { error: err.message ?? "Failed to delete template" },
      { status: 500 }
    )
  }
}
