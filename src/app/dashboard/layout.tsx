import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { WorkspaceContextValue } from "@/context/WorkspaceContext";
import { WORKSPACE_COOKIE } from "@/lib/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  console.log("[DashboardLayout] user:", user?.id ?? "NONE", "error:", userError?.message ?? "none");

  if (!user) redirect("/auth/login");

  const admin = await createAdminClient();

  // 1. Fetch membership first — this is the key check
  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  console.log("[DashboardLayout] fw_ws cookie:", activeWorkspaceId ?? "NONE");

  let membership: any = null;

  if (activeWorkspaceId) {
    const { data: m, error: me } = await admin
      .from("workspace_members")
      .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "active")
      .maybeSingle();
    console.log("[DashboardLayout] membership by cookie:", m?.workspace_id ?? "NONE", "err:", me?.message ?? "none");
    membership = m;
  }

  if (!membership) {
    const { data: m, error: me } = await admin
      .from("workspace_members")
      .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    console.log("[DashboardLayout] membership fallback:", m?.workspace_id ?? "NONE", "err:", me?.message ?? "none");
    membership = m;
  }

  // 2. Fetch profile
  let { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  console.log("[DashboardLayout] profile.onboarding_completed:", profile?.onboarding_completed ?? "NONE", "err:", profileError?.message ?? "none");

  if (!profile) {
    const { data: newProfile } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? "",
        full_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        onboarding_completed: !!membership,
      })
      .select("*")
      .single();
    profile = newProfile;
    console.log("[DashboardLayout] created profile, onboarding_completed:", profile?.onboarding_completed);
  }

  // Heal profile flag if user already has workspace
  if (membership && profile && !profile.onboarding_completed) {
    console.log("[DashboardLayout] healing profile.onboarding_completed to true");
    await admin.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    await admin.from("workspaces").update({ onboarding_completed: true }).eq("owner_id", user.id);
    profile.onboarding_completed = true;
  }

  // 3. If no membership, auto-create a default workspace for user
  if (!membership) {
    console.log("[DashboardLayout] no membership, auto-creating workspace");
    const baseSlug = `workspace-${Date.now().toString(36)}`;
    const { data: ws } = await admin
      .from("workspaces")
      .insert({
        name: "My Workspace",
        slug: baseSlug,
        owner_id: user.id,
        onboarding_completed: true,
      })
      .select("*")
      .single();

    if (ws) {
      await admin.from("workspace_members").upsert({
        workspace_id: ws.id,
        user_id: user.id,
        role: "owner",
        status: "active",
      }, { onConflict: "workspace_id,user_id" });

      const { data: m } = await admin
        .from("workspace_members")
        .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
        .eq("user_id", user.id)
        .eq("workspace_id", ws.id)
        .maybeSingle();
      membership = m;
    }
  }

  let workspace = Array.isArray(membership?.workspaces)
    ? membership.workspaces[0]
    : (membership?.workspaces as any);

  // Fallback: if relation query didn't populate workspace, fetch it directly
  if (!workspace && membership?.workspace_id) {
    const { data: ws } = await admin
      .from("workspaces")
      .select("*")
      .eq("id", membership.workspace_id)
      .maybeSingle();
    workspace = ws;
  }

  // Final safety fallback: create workspace if still null
  if (!workspace) {
    console.log("[DashboardLayout] creating emergency workspace fallback");
    const baseSlug = `workspace-${Date.now().toString(36)}`;
    const { data: ws } = await admin
      .from("workspaces")
      .insert({
        name: "My Workspace",
        slug: baseSlug,
        owner_id: user.id,
        onboarding_completed: true,
      })
      .select("*")
      .single();

    if (ws) {
      await admin.from("workspace_members").upsert({
        workspace_id: ws.id,
        user_id: user.id,
        role: "owner",
        status: "active",
      }, { onConflict: "workspace_id,user_id" });
      workspace = ws;
      if (!membership) {
        membership = { workspace_id: ws.id, role: "owner", credits_used: 0, credit_limit: null };
      }
    }
  }

  // Fetch or create wallet
  let { data: wallet } = await admin
    .from("credit_wallets")
    .select("balance, monthly_grant")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!wallet) {
    await admin.from("credit_wallets").insert({
      workspace_id: workspace.id,
      balance: 1000,
    });
    wallet = { balance: 1000, monthly_grant: 0 };
  }

  console.log("[DashboardLayout] SUCCESS — workspace:", workspace.id, "rendering dashboard");

  const workspaceData: WorkspaceContextValue = {
    profile: {
      id: profile!.id,
      email: profile!.email,
      full_name: profile!.full_name,
      avatar_url: profile!.avatar_url,
      phone: profile!.phone,
      timezone: profile!.timezone ?? "Asia/Kolkata",
      onboarding_completed: true,
    },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      logo_url: workspace.logo_url,
      owner_id: workspace.owner_id,
      default_currency: workspace.default_currency ?? "USD",
    },
    member: {
      role: membership.role,
      credits_used: membership.credits_used ?? 0,
      credit_limit: membership.credit_limit,
    },
    credits: {
      balance: wallet?.balance ?? 0,
      monthly_grant: wallet?.monthly_grant ?? 0,
    },
  };

  return (
    <DashboardShell workspaceData={workspaceData}>
      {children}
    </DashboardShell>
  );
}
