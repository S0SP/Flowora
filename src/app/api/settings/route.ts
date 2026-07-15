import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()

    const { data: ws } = await admin
      .from("workspaces")
      .select("name, industry, timezone, logo_url, default_currency")
      .eq("id", workspaceId)
      .single()

    const { data: settings } = await admin
      .from("workspace_settings")
      .select("default_language, business_hours")
      .eq("workspace_id", workspaceId)
      .single()

    return NextResponse.json({
      workspaceId,
      name: ws?.name ?? "",
      industry: ws?.industry ?? "",
      timezone: ws?.timezone ?? "Asia/Kolkata",
      logoUrl: ws?.logo_url ?? "",
      defaultCurrency: ws?.default_currency ?? "USD",
      language: settings?.default_language ?? "en",
      businessHours: settings?.business_hours ?? [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch settings" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant()
    const admin = await createAdminClient()
    const body = await req.json()
    const { name, industry, timezone, language, businessHours, defaultCurrency } = body

    // 1. Update workspace details
    const updatePayload: Record<string, any> = {
      name,
      industry,
      timezone,
    }
    if (defaultCurrency) {
      updatePayload.default_currency = defaultCurrency
    }

    const { error: wsError } = await admin
      .from("workspaces")
      .update(updatePayload)
      .eq("id", workspaceId)

    if (wsError) throw wsError

    // 2. Update workspace settings
    const { error: setErr } = await admin
      .from("workspace_settings")
      .upsert({
        workspace_id: workspaceId,
        default_language: language || "en",
        business_hours: businessHours || {},
      }, {
        onConflict: "workspace_id",
      })

    if (setErr) throw setErr

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to save settings" }, { status: 500 })
  }
}
