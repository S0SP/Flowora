import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomBytes, createHash } from "crypto";

// ── GET /api/workspace/invitations ──────────────────────────
// List active (non-accepted, non-expired) invitations for the current workspace.
// Admin/owner only.

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Resolve workspace + verify admin role
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .single();

    if (!member) return NextResponse.json({ error: "No workspace" }, { status: 403 });
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: invitations, error } = await supabase
      .from("workspace_invitations")
      .select("id, role, label, expires_at, accepted_at, created_at, key_prefix:token_hash")
      .eq("workspace_id", member.workspace_id)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    const safe = (invitations ?? []).map(inv => {
      let parsedLabel = inv.label;
      let token = null;
      try {
        if (inv.label && inv.label.startsWith('{')) {
          const parsed = JSON.parse(inv.label);
          if (parsed.name !== undefined && parsed.token !== undefined) {
            parsedLabel = parsed.name;
            token = parsed.token;
          }
        }
      } catch(e) {}

      return {
        id: inv.id,
        role: inv.role,
        label: parsedLabel,
        token,
        expires_at: inv.expires_at,
        created_at: inv.created_at,
      };
    });

    return NextResponse.json({ invitations: safe });
  } catch (err: any) {
    console.error("[invitations GET]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}

// ── POST /api/workspace/invitations ─────────────────────────
// Create a new invite link. Returns the plaintext token ONCE.
// Body: { role: string, label?: string, expiresInDays?: number }

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const admin = await createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .single();

    if (!member) return NextResponse.json({ error: "No workspace" }, { status: 403 });
    if (!["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const role = body.role ?? "agent";
    const label = body.label ?? null;
    const expiresInDays = Math.min(body.expiresInDays ?? 7, 30); // cap at 30 days

    if (!["admin", "manager", "agent", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Generate a cryptographically random token
    const plaintoken = randomBytes(32).toString("hex");
    const token_hash = createHash("sha256").update(plaintoken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const labelData = JSON.stringify({ name: label, token: plaintoken });

    const { data: inv, error } = await admin
      .from("workspace_invitations")
      .insert({
        workspace_id: member.workspace_id,
        token_hash,
        role,
        label: labelData,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, role, label, expires_at, created_at")
      .single();

    if (error) throw error;

    let parsedLabel = inv.label;
    try {
      const parsed = JSON.parse(inv.label);
      parsedLabel = parsed.name;
    } catch(e) {}

    return NextResponse.json({
      invitation: { ...inv, label: parsedLabel },
      token: plaintoken,
    });
  } catch (err: any) {
    console.error("[invitations POST]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
