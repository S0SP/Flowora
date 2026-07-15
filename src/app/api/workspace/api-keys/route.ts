import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomBytes, createHash } from "crypto";

// ── GET /api/workspace/api-keys ─────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
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

    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: keys, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, scopes, last_used_at, expires_at, created_at")
      .eq("workspace_id", member.workspace_id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ keys: keys ?? [] });
  } catch (err: any) {
    console.error("[api-keys GET]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}

// ── POST /api/workspace/api-keys ────────────────────────────
// Body: { name: string, scopes?: string[] }

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

    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const scopes: string[] = body.scopes ?? ["read", "write"];

    // Generate key: prefix flw_ + 8 random hex + 40 more random hex
    const rawBytes = randomBytes(24).toString("hex"); // 48 hex chars
    const plainKey = `flw_${rawBytes}`;
    const key_prefix = plainKey.slice(0, 12); // "flw_" + first 8 chars
    const key_hash = createHash("sha256").update(plainKey).digest("hex");

    const { data: keyRow, error } = await admin
      .from("api_keys")
      .insert({
        workspace_id: member.workspace_id,
        name,
        key_hash,
        key_prefix,
        scopes,
        created_by: user.id,
      })
      .select("id, name, key_prefix, scopes, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      key: keyRow,
      plaintext: plainKey, // returned ONCE — never stored
    });
  } catch (err: any) {
    console.error("[api-keys POST]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
