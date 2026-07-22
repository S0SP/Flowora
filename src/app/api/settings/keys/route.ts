import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getTenant, TenantError } from "@/lib/tenant"
import { encrypt } from "@/lib/crypto"
import { z } from "zod"

const keySchema = z.object({
  workspaceId: z.string().uuid(),
  type: z.enum(["whatsapp", "openai", "gemini", "livekit", "email", "sms", "voice"]),
  config: z.record(z.any()).default({}),
  secrets: z.record(z.string()).default({}),
  label: z.string().optional(),
})

// POST /api/settings/keys — save a channel connection with encrypted secrets
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const parsed = keySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { workspaceId, type, config, secrets, label } = parsed.data

    const admin = await createAdminClient()
    const { data: membership } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const encryptedSecrets: Record<string, string> = {}
    for (const [k, v] of Object.entries(secrets)) {
      if (v) encryptedSecrets[k] = await encrypt(v)
    }

    // Check if the connection already exists
    const { data: existing } = await admin
      .from("channel_connections")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", type)
      .maybeSingle()

    let queryResult;
    if (existing) {
      queryResult = await admin
        .from("channel_connections")
        .update({
          label: label ?? type,
          config,
          secrets_enc: JSON.stringify(encryptedSecrets),
          is_active: true,
        })
        .eq("id", existing.id)
        .select("id")
        .single()
    } else {
      queryResult = await admin
        .from("channel_connections")
        .insert({
          workspace_id: workspaceId,
          type,
          label: label ?? type,
          config,
          secrets_enc: JSON.stringify(encryptedSecrets),
          is_active: true,
        })
        .select("id")
        .single()
    }

    const { data, error } = queryResult

    if (error) {
      console.error("[keys/POST] Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Automate Dograh DID Registration if voice type and has phone
    const phoneNumber = config?.dograhPhoneNumber || config?.phone
    if (type === "voice" && phoneNumber) {
      const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000"
      const secret = process.env.DOGRAH_SECRET || process.env.DOGRAH_API_SECRET || "change-me-in-production"
      
      let inboundWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10)

      if (config?.dograhWorkflowId) {
        const parsed = parseInt(String(config.dograhWorkflowId), 10)
        if (!isNaN(parsed) && parsed > 0) inboundWorkflowId = parsed
      } else if (config?.inboundPresetId) {
        const { data: preset } = await admin
          .from("voice_agents")
          .select("dograh_workflow_id, agent_type, voice_id")
          .eq("id", config.inboundPresetId)
          .maybeSingle()

        if (preset?.dograh_workflow_id) {
          const parsed = parseInt(String(preset.dograh_workflow_id), 10)
          if (!isNaN(parsed) && parsed > 0) inboundWorkflowId = parsed

          // For Gemini presets: bake the voice into the workflow's workflow_configurations
          // so that ALL inbound calls to this number use the correct voice, even if the
          // preset was created before this sync was in place.
          if (preset.agent_type === "gemini" && preset.voice_id) {
            const dograhUrl2 = process.env.DOGRAH_API_URL || "http://localhost:8000"
            const secret2 = process.env.DOGRAH_SECRET || process.env.DOGRAH_API_SECRET || "change-me-in-production"
            try {
              const voiceSyncRes = await fetch(
                `${dograhUrl2}/api/v1/workflow/${inboundWorkflowId}`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Flowra-Secret": secret2,
                    "Authorization": `Bearer ${secret2}`,
                  },
                  body: JSON.stringify({
                    workflow_configurations: {
                      model_overrides: {
                        is_realtime: true,
                        realtime: {
                          provider: "google_realtime",
                          voice: preset.voice_id,
                          // No model — use org's configured model (gemini-3.1-flash-live-preview)
                        },
                      },
                    },
                  }),
                }
              )
              if (!voiceSyncRes.ok) {
                console.warn(`[keys/POST] Failed to sync voice for inbound workflow ${inboundWorkflowId}: ${await voiceSyncRes.text()}`)
              } else {
                console.log(`[keys/POST] Voice "${preset.voice_id}" synced to inbound workflow ${inboundWorkflowId}`)
              }
            } catch (voiceSyncErr) {
              console.error("[keys/POST] Voice sync request failed:", voiceSyncErr)
            }
          }
        }
      }

      try {
        let cleanPhone = phoneNumber.replace(/[^\d+]/g, "")
        if (/^\d+$/.test(cleanPhone)) {
          cleanPhone = "+" + cleanPhone
        }
        
        const reqHeaders = { 
          "X-Flowra-Secret": secret, 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`
        }

        let phoneNumId = null
        const listRes = await fetch(`${dograhUrl}/api/v1/organizations/telephony-configs/1/phone-numbers`, {
          headers: reqHeaders
        })
        
        if (listRes.ok) {
          const data = await listRes.json()
          const checkBase = cleanPhone.replace(/\D/g, "")
          const existing = data.phone_numbers?.find((p: any) => {
            const pBase = (p.address || "").replace(/\D/g, "")
            return checkBase === pBase
          })
          if (existing) {
            phoneNumId = existing.id
          }
        }

        let didRes
        if (phoneNumId) {
          didRes = await fetch(`${dograhUrl}/api/v1/organizations/telephony-configs/1/phone-numbers/${phoneNumId}`, {
            method: "PUT",
            headers: reqHeaders,
            body: JSON.stringify({
              inbound_workflow_id: inboundWorkflowId,
              is_active: true,
            }),
          })
        } else {
          didRes = await fetch(`${dograhUrl}/api/v1/organizations/telephony-configs/1/phone-numbers`, {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
              address: cleanPhone,
              inbound_workflow_id: inboundWorkflowId,
              is_active: true,
            }),
          })
        }

        if (!didRes.ok) {
          console.warn("[keys/POST] Dograh DID registration/update failed:", await didRes.text())
        } else {
          console.log(`[keys/POST] Dograh DID synced for phone ${cleanPhone} with inbound_workflow_id=${inboundWorkflowId}`)
        }
      } catch (didErr) {
        console.error("[keys/POST] Dograh DID request failed:", didErr)
      }
    }

    return NextResponse.json({ id: data?.id, ok: true }, { status: 200 })
  } catch (err: any) {
    console.error("[keys/POST] Unhandled crash:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET /api/settings/keys — list channel connections (config only, no secrets)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let ctx;
  try {
    ctx = await getTenant()
  } catch (err: any) {
    const status = err instanceof TenantError ? err.status : 500
    return NextResponse.json({ error: err.message }, { status })
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("channel_connections")
    .select("id, type, label, config, is_active, created_at, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ connections: data ?? [] })
}

// DELETE /api/settings/keys?id=xxx — remove a channel connection
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let ctx;
  try {
    ctx = await getTenant()
  } catch (err: any) {
    const status = err instanceof TenantError ? err.status : 500
    return NextResponse.json({ error: err.message }, { status })
  }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("channel_connections")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
