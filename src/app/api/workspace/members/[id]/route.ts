import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

// ── PATCH /api/workspace/members/[id] ──────────────────────
// Change a member's role. Admin/owner only. Cannot change owner's role.

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const admin = await createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: myMember } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .single();

    if (!myMember || !["owner", "admin"].includes(myMember.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const newRole = body.role;
    if (!["admin", "manager", "agent", "viewer"].includes(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent changing owner role
    const { data: target } = await admin
      .from("workspace_members")
      .select("role, workspace_id")
      .eq("id", id)
      .single();

    if (!target || target.workspace_id !== myMember.workspace_id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (target.role === "owner") {
      return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
    }

    const { error } = await admin
      .from("workspace_members")
      .update({ role: newRole })
      .eq("id", id)
      .eq("workspace_id", myMember.workspace_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[member PATCH]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}

// ── DELETE /api/workspace/members/[id] ─────────────────────
// Remove a member from the workspace. Admin/owner only. Cannot remove owner.

export async function DELETE(_req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const admin = await createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: myMember } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .single();

    if (!myMember || !["owner", "admin"].includes(myMember.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: target } = await admin
      .from("workspace_members")
      .select("role, workspace_id, user_id")
      .eq("id", id)
      .single();

    if (!target || target.workspace_id !== myMember.workspace_id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (target.role === "owner") {
      return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 400 });
    }
    if (target.user_id === user.id) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    const { error } = await admin
      .from("workspace_members")
      .delete()
      .eq("id", id)
      .eq("workspace_id", myMember.workspace_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[member DELETE]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
