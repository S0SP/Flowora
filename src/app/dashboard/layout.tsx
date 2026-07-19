import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { WorkspaceContextValue } from "@/context/WorkspaceContext";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    throw new Error(`Database error (profile): ${(profileError as any).message}`);
  }

  if (!profile) redirect("/onboarding");
  if (!profile.onboarding_completed) redirect("/onboarding");

  // First active workspace membership
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, credits_used, credit_limit, workspaces(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (membershipError && membershipError.code !== "PGRST116") {
    throw new Error(`Database error (membership): ${(membershipError as any).message}`);
  }

  if (!membership) redirect("/onboarding");

  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces as any;

  if (!workspace) redirect("/onboarding");

  const { data: wallet, error: walletError } = await supabase
    .from("credit_wallets")
    .select("balance, monthly_grant")
    .eq("workspace_id", workspace.id)
    .single();

  if (walletError && walletError.code !== "PGRST116") {
    throw new Error(`Database error (wallet): ${(walletError as any).message}`);
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
