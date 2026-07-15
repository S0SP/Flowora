import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getTenant, TenantError } from '@/lib/tenant'
import { decrypt } from '@/lib/crypto'
import {
  getSubscribedApps,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'

export async function GET() {
  try {
    let ctx
    try {
      ctx = await getTenant()
    } catch (err: any) {
      const status = err instanceof TenantError ? err.status : 401
      return NextResponse.json({ error: err.message }, { status })
    }

    const admin = await createAdminClient()
    const { data: conn, error: connError } = await admin
      .from('channel_connections')
      .select('config, secrets_enc, registered_at, subscribed_apps_at, last_registration_error')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'whatsapp')
      .maybeSingle()

    if (connError) {
      console.error('Error fetching channel connection:', connError)
      return NextResponse.json({
        live: false,
        checks: { config_exists: false },
        message: 'Failed to fetch configuration',
      })
    }

    if (!conn) {
      return NextResponse.json({
        live: false,
        checks: { config_exists: false },
        message: 'No WhatsApp configuration saved yet.',
      })
    }

    let accessToken: string
    try {
      if (!conn.secrets_enc) throw new Error('No encrypted secrets')
      const secretsObj = JSON.parse(conn.secrets_enc)
      if (!secretsObj.accessToken) throw new Error('No accessToken in secrets')
      accessToken = await decrypt(secretsObj.accessToken)
    } catch {
      return NextResponse.json({
        live: false,
        checks: {
          config_exists: true,
          token_decryptable: false,
        },
        message:
          'Stored access token can\'t be decrypted — likely ENCRYPTION_KEY changed. Re-enter the token to repair.',
      })
    }

    const checks: {
      config_exists: boolean
      token_decryptable: boolean
      phone_metadata_ok: boolean
      waba_subscribed_to_app: boolean | null
      locally_marked_registered: boolean
    } = {
      config_exists: true,
      token_decryptable: true,
      phone_metadata_ok: false,
      waba_subscribed_to_app: null,
      locally_marked_registered: conn.registered_at != null,
    }
    const errors: string[] = []

    try {
      await verifyPhoneNumber({
        phoneNumberId: conn.config.phone_number_id,
        accessToken,
      })
      checks.phone_metadata_ok = true
    } catch (err) {
      errors.push(
        `Phone metadata check failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (conn.config.waba_id) {
      try {
        const subs = await getSubscribedApps({
          wabaId: conn.config.waba_id,
          accessToken,
        })
        checks.waba_subscribed_to_app = subs.length > 0
        if (!checks.waba_subscribed_to_app) {
          errors.push(
            'WABA has no subscribed apps. Re-save the configuration to subscribe.',
          )
        }
      } catch (err) {
        errors.push(
          `WABA subscription check failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else {
      errors.push(
        'No WABA ID on file — webhooks can\'t be wired without it. Add it in the form and re-save.',
      )
    }

    const live =
      checks.phone_metadata_ok &&
      (checks.waba_subscribed_to_app ?? false) &&
      checks.locally_marked_registered

    return NextResponse.json({
      live,
      checks,
      errors,
      last_registration_error: conn.last_registration_error ?? null,
      registered_at: conn.registered_at ?? null,
      subscribed_apps_at: conn.subscribed_apps_at ?? null,
    })
  } catch (error) {
    console.error('Error in WhatsApp config verify-registration GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
