import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// ── GET /api/workspace/members ──────────────────────────────
// List all active members of the current workspace with profile data.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: myMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .single();

    if (!myMember) return NextResponse.json({ error: "No workspace" }, { status: 403 });

    const admin = await createAdminClient();

    // Fetch members + join profiles
    const { data: members, error } = await admin
      .from("workspace_members")
      .select(`
        id,
        user_id,
        role,
        status,
        created_at,
        profiles ( full_name, email, avatar_url, phone )
      `)
      .eq("workspace_id", myMember.workspace_id)
      .in("status", ["active", "pending", "invited"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Fetch presence for all member user_ids
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    const { data: presenceRows } = await admin
      .from("member_presence")
      .select("user_id, status, last_seen_at")
      .eq("workspace_id", myMember.workspace_id)
      .in("user_id", userIds);

    const presenceMap = new Map<string, { status: string; last_seen_at: string }>();
    for (const p of presenceRows ?? []) {
      presenceMap.set(p.user_id, { status: p.status, last_seen_at: p.last_seen_at });
    }

    const result = (members ?? []).map((m: any) => {
      const profile = m.profiles as { full_name: string | null; email: string; avatar_url: string | null; phone: string | null } | null;
      const presence = presenceMap.get(m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        created_at: m.created_at,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? "",
        avatar_url: profile?.avatar_url ?? null,
        phone: profile?.phone ?? null,
        presence_status: presence?.status ?? "offline",
        last_seen_at: presence?.last_seen_at ?? null,
      };
    });

    return NextResponse.json({ members: result });
  } catch (err: any) {
    console.error("[members GET]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
