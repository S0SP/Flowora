import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getTenant, TenantError } from '@/lib/tenant'
import { decrypt, parseSecrets } from '@/lib/crypto'
import {
  deleteMessageTemplate,
  editMessageTemplate,
} from '@/lib/whatsapp/meta-api'
import {
  validateTemplatePayload,
  type TemplatePayload,
} from '@/lib/whatsapp/template-validators'
import { buildMetaTemplatePayload } from '@/lib/whatsapp/template-components'
import { ensureImageHeaderHandle } from '@/lib/whatsapp/template-header-handle'

const EDITABLE_STATUSES = new Set(['APPROVED', 'REJECTED', 'PAUSED'])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDryRun(): boolean {
  return (
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === 'true' ||
    process.env.WHATSAPP_TEMPLATES_DRY_RUN === '1'
  )
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 },
      )
    }

    let ctx
    try {
      ctx = await getTenant()
    } catch (err: any) {
      const status = err instanceof TenantError ? err.status : 401
      return NextResponse.json({ error: err.message }, { status })
    }

    let payload: TemplatePayload
    try {
      payload = (await request.json()) as TemplatePayload
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const admin = await createAdminClient()

    const { data: existing, error: lookupErr } = await admin
      .from('message_templates')
      .select('id, name, status, meta_template_id, language')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle()

    if (lookupErr || !existing) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    }

    if (!existing.meta_template_id) {
      return NextResponse.json(
        {
          error:
            'This template was never submitted to Meta — use New Template to submit it instead.',
        },
        { status: 400 },
      )
    }

    if (!EDITABLE_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          error: `Templates in status ${existing.status} cannot be edited. Allowed: APPROVED, REJECTED, PAUSED.`,
        },
        { status: 400 },
      )
    }

    if (payload.category === 'Authentication') {
      return NextResponse.json(
        {
          error:
            'AUTHENTICATION templates are not editable here — manage them in Meta WhatsApp Manager.',
        },
        { status: 400 },
      )
    }

    try {
      validateTemplatePayload(payload)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Validation failed.' },
        { status: 400 },
      )
    }

    if (!isDryRun()) {
      const { data: conn, error: connError } = await admin
        .from('channel_connections')
        .select('config, secrets_enc')
        .eq('workspace_id', ctx.workspaceId)
        .eq('type', 'whatsapp')
        .maybeSingle()

      if (connError || !conn) {
        return NextResponse.json(
          { error: 'WhatsApp not configured.' },
          { status: 400 },
        )
      }

      let accessToken: string
      try {
        if (!conn.secrets_enc) throw new Error('No encrypted secrets')
        const secretsObj = parseSecrets(conn.secrets_enc)
        if (!secretsObj.accessToken) throw new Error('No accessToken in secrets')
        accessToken = await decrypt(secretsObj.accessToken)
      } catch (err) {
        return NextResponse.json(
          { error: 'Stored access token decryption failed. Please re-save WhatsApp config.' },
          { status: 400 }
        )
      }

      try {
        await ensureImageHeaderHandle(payload, accessToken)
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Header image upload failed.' },
          { status: 400 },
        )
      }

      const metaPayload = buildMetaTemplatePayload(payload)
      try {
        await editMessageTemplate({
          metaTemplateId: existing.meta_template_id,
          accessToken,
          components: metaPayload.components,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Meta edit failed.'
        await admin
          .from('message_templates')
          .update({
            submission_error: message,
            last_submitted_at: new Date().toISOString(),
          })
          .eq('id', id)
        return NextResponse.json({ error: message }, { status: 502 })
      }
    }

    const { data: row, error: updErr } = await admin
      .from('message_templates')
      .update({
        category: payload.category,
        header_type: payload.header_type ?? null,
        header_content: payload.header_content ?? null,
        header_media_url: payload.header_media_url ?? null,
        header_handle: payload.header_handle ?? null,
        body_text: payload.body_text,
        footer_text: payload.footer_text ?? null,
        buttons: payload.buttons ?? null,
        sample_values: payload.sample_values ?? null,
        status: 'PENDING',
        submission_error: null,
        rejection_reason: null,
        last_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updErr) {
      return NextResponse.json(
        {
          error: `Edited on Meta but failed to save locally: ${updErr.message}. Run "Sync from Meta" to recover.`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      template: row,
      dry_run: isDryRun(),
    })
  } catch (error) {
    console.error('Error editing template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to edit template.',
      },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Invalid template id.' },
        { status: 400 },
      )
    }

    let ctx
    try {
      ctx = await getTenant()
    } catch (err: any) {
      const status = err instanceof TenantError ? err.status : 401
      return NextResponse.json({ error: err.message }, { status })
    }

    const admin = await createAdminClient()

    const { data: existing, error: lookupErr } = await admin
      .from('message_templates')
      .select('id, name, meta_template_id')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle()

    if (lookupErr || !existing) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
    }

    if (existing.meta_template_id && !isDryRun()) {
      const { data: conn, error: connError } = await admin
        .from('channel_connections')
        .select('config, secrets_enc')
        .eq('workspace_id', ctx.workspaceId)
        .eq('type', 'whatsapp')
        .maybeSingle()

      if (connError || !conn || !conn.config?.waba_id) {
        return NextResponse.json(
          { error: 'WhatsApp not configured — cannot delete on Meta.' },
          { status: 400 },
        )
      }

      let accessToken: string
      try {
        if (!conn.secrets_enc) throw new Error('No encrypted secrets')
        const secretsObj = parseSecrets(conn.secrets_enc)
        if (!secretsObj.accessToken) throw new Error('No accessToken in secrets')
        accessToken = await decrypt(secretsObj.accessToken)
      } catch (err) {
        return NextResponse.json(
          { error: 'Stored access token decryption failed. Please re-save WhatsApp config.' },
          { status: 400 }
        )
      }

      try {
        await deleteMessageTemplate({
          wabaId: conn.config.waba_id,
          accessToken,
          name: existing.name,
          metaTemplateId: existing.meta_template_id,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Meta delete failed.'
        return NextResponse.json({ error: message }, { status: 502 })
      }
    }

    const { error: delErr } = await admin
      .from('message_templates')
      .delete()
      .eq('id', id)

    if (delErr) {
      return NextResponse.json(
        {
          error: `Deleted on Meta but failed to delete locally: ${delErr.message}.`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, dry_run: isDryRun() })
  } catch (error) {
    console.error('Error deleting template:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete template.',
      },
      { status: 500 },
    )
  }
}
