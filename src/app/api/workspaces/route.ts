import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  industry: z.string().optional(),
  timezone: z.string().default("Asia/Kolkata"),
})

// GET /api/workspaces — get user's active workspaces
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const admin = await createAdminClient()
  const { data: memberships } = await admin
    .from("workspace_members")
    .select("role, status, workspace_id, workspaces(id, name, slug, logo_url, onboarding_completed)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })

  const workspaces = (memberships ?? []).map((m: any) => ({
    role: m.role,
    ...m.workspaces,
  })).filter((w: any) => w.id)

  const activeWorkspace = workspaces[0] ?? null

  return NextResponse.json({ workspaces, activeWorkspace })
}

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

    const response = NextResponse.json({ workspaceId, slug }, { status: 201 })
    response.cookies.set("fw_ws", workspaceId, { path: "/", httpOnly: false, sameSite: "lax" })
    return response
  } catch (err: any) {
    console.error("[api/workspaces] create failed", err)
    return NextResponse.json({ error: err.message ?? "Failed to create workspace" }, { status: 500 })
  }
}

// PATCH /api/workspaces — complete onboarding
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  let { workspaceId } = body

  const admin = await createAdminClient()

  if (!workspaceId) {
    // Find active workspace for user
    const { data: membership } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (membership?.workspace_id) {
      workspaceId = membership.workspace_id
    }
  }

  // If still no workspace exists for user, create a default workspace
  if (!workspaceId) {
    const baseSlug = `workspace-${Date.now().toString(36)}`
    const { data: ws } = await admin.from("workspaces").insert({
      name: "My Workspace",
      slug: baseSlug,
      owner_id: user.id,
      onboarding_completed: true,
    }).select("id").single()

    if (ws) {
      workspaceId = ws.id
      await admin.from("workspace_members").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        role: "owner",
        status: "active",
      })
    }
  }

  if (workspaceId) {
    await admin.from("workspaces").update({ onboarding_completed: true }).eq("id", workspaceId)
  }
  await admin.from("workspaces").update({ onboarding_completed: true }).eq("owner_id", user.id)

  await admin.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    onboarding_completed: true,
  }, { onConflict: "id" })

  const response = NextResponse.json({ ok: true, workspaceId })
  if (workspaceId) {
    response.cookies.set("fw_ws", workspaceId, { path: "/", httpOnly: false, sameSite: "lax" })
  }
  return response
}

