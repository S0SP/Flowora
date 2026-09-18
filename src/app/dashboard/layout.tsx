import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { WorkspaceContextValue } from "@/context/WorkspaceContext";
import { WORKSPACE_COOKIE } from "@/lib/tenant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const admin = await createAdminClient();

  // 1. Fetch or create profile using admin client (bypasses RLS issues)
  let { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const { data: newProfile } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? "",
        full_name: user.user_metadata?.full_name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
        onboarding_completed: false,
      })
      .select("*")
      .single();
    profile = newProfile;
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  // 2. Fetch membership (try activeWorkspaceId cookie first, then fallback to first active membership)
  const cookieStore = await cookies();
  const activeWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;

  let membership: any = null;

  if (activeWorkspaceId) {
    const { data: m } = await admin
      .from("workspace_members")
      .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
      .eq("user_id", user.id)
      .eq("workspace_id", activeWorkspaceId)
      .eq("status", "active")
      .maybeSingle();
    membership = m;
  }

  if (!membership) {
    const { data: m } = await admin
      .from("workspace_members")
      .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    membership = m;
  }

  // 3. If STILL no membership for an onboarded user, auto-create default workspace
  if (!membership) {
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
      await admin.from("workspace_members").insert({
        workspace_id: ws.id,
        user_id: user.id,
        role: "owner",
        status: "active",
      });

      const { data: m } = await admin
        .from("workspace_members")
        .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
        .eq("user_id", user.id)
        .eq("workspace_id", ws.id)
        .single();
      membership = m;
    }
  }

  if (!membership) {
    redirect("/onboarding");
  }

  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : (membership.workspaces as any);

  if (!workspace) redirect("/onboarding");

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

  const workspaceData: WorkspaceContextValue = {
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      phone: profile.phone,
      timezone: profile.timezone ?? "Asia/Kolkata",
      onboarding_completed: profile.onboarding_completed,
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
