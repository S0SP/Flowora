import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

type RouteContext = { params: Promise<{ token: string }> };

// ── GET /api/invite/[token]/peek ────────────────────────────
// Public endpoint: returns workspace name + role for the invite card.
// Uses service role to bypass RLS (anonymous visitors can see it).
// Never returns the token hash or any sensitive data.

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { token } = await ctx.params;
    if (!token || token.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const token_hash = createHash("sha256").update(token).digest("hex");
    const admin = await createAdminClient();

    const { data: invite, error } = await admin
      .from("workspace_invitations")
      .select(`
        id,
        role,
        label,
        expires_at,
        accepted_at,
        workspace_id,
        workspaces ( name, logo_url, slug )
      `)
      .eq("token_hash", token_hash)
      .maybeSingle();

    if (error) throw error;

    if (!invite) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (invite.accepted_at) {
      return NextResponse.json({ error: "Invitation already accepted" }, { status: 410 });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
    }

    const workspace = invite.workspaces as unknown as { name: string; logo_url: string | null; slug: string } | null;

    return NextResponse.json({
      id: invite.id,
      role: invite.role,
      label: invite.label,
      expires_at: invite.expires_at,
      workspace: {
        name: workspace?.name ?? "Unknown",
        logo_url: workspace?.logo_url ?? null,
        slug: workspace?.slug ?? "",
      },
    });
  } catch (err: any) {
    console.error("[invite peek]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
