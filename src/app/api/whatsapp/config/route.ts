import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getTenant, TenantError } from '@/lib/tenant'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/crypto'

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
      .select('config, secrets_enc, is_active, registered_at, subscribed_apps_at, last_registration_error')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'whatsapp')
      .maybeSingle()

    if (connError) {
      console.error('Error fetching channel connection:', connError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!conn) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'No WhatsApp configuration saved yet. Fill in the form and click Save Configuration.',
        },
        { status: 200 }
      )
    }

    let accessToken: string
    try {
      if (!conn.secrets_enc) throw new Error('No encrypted secrets')
      const secretsObj = JSON.parse(conn.secrets_enc)
      if (!secretsObj.accessToken) throw new Error('No accessToken in secrets')
      accessToken = await decrypt(secretsObj.accessToken)
    } catch (err) {
      console.error('[whatsapp/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. Click "Reset Configuration" below, then re-save.',
        },
        { status: 200 }
      )
    }

    try {
      const phoneInfo = await verifyPhoneNumber({
        phoneNumberId: conn.config.phone_number_id,
        accessToken,
      })
      return NextResponse.json({
        connected: true,
        phone_info: phoneInfo,
        config: conn.config,
        registered_at: conn.registered_at,
        subscribed_apps_at: conn.subscribed_apps_at,
        last_registration_error: conn.last_registration_error,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
          config: conn.config,
          registered_at: conn.registered_at,
          subscribed_apps_at: conn.subscribed_apps_at,
          last_registration_error: conn.last_registration_error,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    let ctx
    try {
      ctx = await getTenant()
    } catch (err: any) {
      const status = err instanceof TenantError ? err.status : 401
      return NextResponse.json({ error: err.message }, { status })
    }

    const body = await request.json()
    const { phone_number_id, waba_id, access_token, verify_token, pin } = body

    if (!access_token || !phone_number_id) {
      return NextResponse.json(
        { error: 'access_token and phone_number_id are required' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    const admin = await createAdminClient()

    // Check if another workspace claimed this phone_number_id
    const { data: claimed, error: claimedError } = await admin
      .from('channel_connections')
      .select('workspace_id')
      .eq('type', 'whatsapp')
      .eq('config->>phone_number_id', phone_number_id)
      .neq('workspace_id', ctx.workspaceId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another workspace. Each phone number can only be connected to one workspace.',
        },
        { status: 409 }
      )
    }

    // Verify credentials with Meta
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    // Encrypt token
    let encryptedAccessToken: string
    try {
      encryptedAccessToken = await encrypt(access_token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        { error: 'Failed to encrypt token.' },
        { status: 500 }
      )
    }

    const { data: existing } = await admin
      .from('channel_connections')
      .select('id, registered_at, config')
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'whatsapp')
      .maybeSingle()

    const sameNumber =
      existing?.config?.phone_number_id === phone_number_id &&
      existing?.registered_at != null

    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    let registrationSkipped = false

    const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
    if (needsRegistration) {
      if (!pin) {
        registrationSkipped = true
      } else {
        try {
          await registerPhoneNumber({
            phoneNumberId: phone_number_id,
            accessToken: access_token,
            pin,
          })
          registeredAt = new Date().toISOString()
        } catch (err) {
          registrationError = err instanceof Error ? err.message : 'Unknown Meta API error'
          console.error('Phone number /register failed:', registrationError)
        }
      }
    }

    let subscribedAppsAt: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: access_token,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('WABA subscribed_apps failed (non-fatal):', message)
      }
    }

    const baseRow = {
      label: 'WhatsApp',
      config: {
        phone_number_id,
        waba_id: waba_id || null,
        verify_token: verify_token || null,
      },
      secrets_enc: JSON.stringify({ accessToken: encryptedAccessToken }),
      is_active: !registrationError,
      registered_at: registrationError ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await admin
        .from('channel_connections')
        .update(baseRow)
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error updating channel_connection:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await admin
        .from('channel_connections')
        .insert({
          workspace_id: ctx.workspaceId,
          type: 'whatsapp',
          created_by: ctx.userId,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting channel_connection:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
    }

    if (registrationError) {
      return NextResponse.json({
        success: false,
        saved: true,
        registered: false,
        registration_error: registrationError,
        phone_info: phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: registeredAt != null,
      registration_skipped: registrationSkipped,
      phone_info: phoneInfo,
    })
  } catch (error) {
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    let ctx
    try {
      ctx = await getTenant()
    } catch (err: any) {
      const status = err instanceof TenantError ? err.status : 401
      return NextResponse.json({ error: err.message }, { status })
    }

    const admin = await createAdminClient()
    const { error: deleteError } = await admin
      .from('channel_connections')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('type', 'whatsapp')

    if (deleteError) {
      console.error('Error deleting channel connection:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
