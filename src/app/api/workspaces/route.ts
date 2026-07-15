import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  industry: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
})

// POST /api/workspaces — create workspace + default pipeline + seed data
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createWorkspaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { name, industry, timezone } = parsed.data
  const admin = await createAdminClient()

  // Generate slug
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30)
  const slug = `${baseSlug}-${Date.now().toString(36)}`

  try {
    // 1. Ensure profile exists first (to satisfy workspaces_owner_id_fkey reference to profiles table)
    const { error: profileError } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email ?? "",
      full_name: user.user_metadata?.full_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      onboarding_completed: false,
    })

    if (profileError) {
      throw profileError
    }

    // 2. Create workspace
    const { data: workspace, error: wsError } = await admin.from("workspaces").insert({
      name,
      slug,
      industry: industry ?? null,
      timezone,
      owner_id: user.id,
      onboarding_completed: false,
    }).select("id").single()

    if (wsError || !workspace) {
      throw wsError ?? new Error("Failed to create workspace")
    }

    const workspaceId = workspace.id

    // 2. Create owner membership
    await admin.from("workspace_members").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      role: "owner",
      status: "active",
      permissions: {
        inbox: { read: true, write: true },
        contacts: { read: true, write: true },
        campaigns: { read: true, write: true },
        workflows: { read: true, write: true },
        voice: { read: true, write: true },
        billing: { read: true, write: true },
        team: { read: true, write: true },
        settings: { read: true, write: true },
        integrations: { read: true, write: true },
        analytics: { read: true, write: true },
      },
      credit_limit: null,
    })

    // 3. Create workspace settings
    await admin.from("workspace_settings").insert({
      workspace_id: workspaceId,
      default_language: "en",
      auto_assign: true,
    })

    // 4. Create credit wallet (trial: 1000 credits)
    await admin.from("credit_wallets").insert({
      workspace_id: workspaceId,
      balance: 1000,
    })
    await admin.from("credit_ledger").insert({
      workspace_id: workspaceId,
      type: "subscription_grant",
      amount: 1000,
      operation: null,
      meta: { reason: "trial_signup" },
    })

    // 5. Create default sales pipeline
    const { data: pipeline } = await admin.from("pipelines").insert({
      workspace_id: workspaceId,
      name: "Sales Pipeline",
      is_default: true,
    }).select("id").single()

    if (pipeline) {
      await admin.from("pipeline_stages").insert([
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "New Lead", color: "#B1D8FC", position: 0 },
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "Contacted", color: "#FFE27C", position: 1 },
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "Qualified", color: "#C4B1F9", position: 2 },
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "Proposal Sent", color: "#F59E0B", position: 3 },
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "Won", color: "#22C55E", position: 4 },
        { workspace_id: workspaceId, pipeline_id: pipeline.id, name: "Lost", color: "#EF4444", position: 5 },
      ])
    }

    return NextResponse.json({ workspaceId, slug }, { status: 201 })
  } catch (err: any) {
    console.error("[api/workspaces] create failed", err)
    return NextResponse.json({ error: err.message ?? "Failed to create workspace" }, { status: 500 })
  }
}

// PATCH /api/workspaces/[id]/complete-onboarding
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const body = await req.json()
  const { workspaceId } = body
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 })

  const admin = await createAdminClient()
  await admin.from("workspaces").update({ onboarding_completed: true }).eq("id", workspaceId).eq("owner_id", user.id)
  await admin.from("profiles").update({ onboarding_completed: true }).eq("id", user.id)

  return NextResponse.json({ ok: true })
}
