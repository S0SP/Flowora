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
      .maybeSingle();

    if (!myMember) return NextResponse.json({ error: "No workspace" }, { status: 403 });

    const admin = await createAdminClient();

    // Fetch members (use * to avoid missing column errors if partially migrated)
    const { data: members, error } = await admin
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", myMember.workspace_id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Fetch presence for all member user_ids
    const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
    let presenceRows: any[] = [];
    if (userIds.length > 0) {
      const { data } = await admin
        .from("member_presence")
        .select("user_id, status, last_seen_at")
        .eq("workspace_id", myMember.workspace_id)
        .in("user_id", userIds);
      presenceRows = data || [];
    }

    const presenceMap = new Map<string, { status: string; last_seen_at: string }>();
    for (const p of presenceRows) {
      presenceMap.set(p.user_id, { status: p.status, last_seen_at: p.last_seen_at });
    }

    const result = (members ?? []).map((m: any) => {
      const presence = m.user_id ? presenceMap.get(m.user_id) : undefined;
      return {
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        created_at: m.created_at,
        full_name: m.full_name ?? null,
        email: m.email ?? "",
        avatar_url: m.avatar_url ?? null,
        phone: null, // Phone is no longer fetched here since it's not on workspace_members, but UI might need it? Set null.
        presence_status: presence?.status ?? "offline",
        last_seen_at: presence?.last_seen_at ?? null,
      };
    });

    return NextResponse.json({ members: result });
  } catch (err: any) {
    console.error("[members GET]", err);
    return NextResponse.json(
      { error: "Internal error", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
