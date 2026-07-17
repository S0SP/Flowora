import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

type RouteContext = { params: Promise<{ token: string }> };

// ── POST /api/invite/[token]/accept ─────────────────────────
// Authenticated endpoint: current user accepts the invite,
// joins the workspace, marks the invitation accepted.

export async function POST(_req: Request, ctx: RouteContext) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const supabase = await createClient();
    const admin = await createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "You must be signed in to accept an invite" }, { status: 401 });
    }

    const token_hash = createHash("sha256").update(token).digest("hex");

    // Look up the invitation
    const { data: invite, error: invErr } = await admin
      .from("workspace_invitations")
      .select("id, workspace_id, role, accepted_at, expires_at")
      .eq("token_hash", token_hash)
      .maybeSingle();

    if (invErr) throw invErr;
    if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    if (invite.accepted_at) return NextResponse.json({ error: "Already accepted" }, { status: 410 });
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
    }

    // Check if already a member
    const { data: existing } = await admin
      .from("workspace_members")
      .select("id, status")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json({ error: "You are already a member of this workspace" }, { status: 409 });
      }
      // Reactivate suspended/pending member
      await admin
        .from("workspace_members")
        .update({ status: "active", role: invite.role })
        .eq("id", existing.id);
    } else {
      // Add new member
      const { error: memberErr } = await admin
        .from("workspace_members")
        .insert({
          workspace_id: invite.workspace_id,
          user_id: user.id,
          role: invite.role,
          created_at: new Date().toISOString(),
          invited_by: null,
        });
      if (memberErr) throw memberErr;
    }

    // Mark invitation accepted
    await admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq("id", invite.id);

    return NextResponse.json({
      success: true,
      workspace_id: invite.workspace_id,
      role: invite.role,
    });
  } catch (err: any) {
    console.error("[invite accept]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
