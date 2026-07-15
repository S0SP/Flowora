import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── POST /api/workspace/presence ────────────────────────────
// Called by PresenceHeartbeat every ~30s.
// Body: { status: "online" | "away" }

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const status = body.status === "away" ? "away" : "online";

    // Use the RPC which handles workspace_id resolution internally
    const { error } = await supabase.rpc("touch_presence", { p_status: status });

    if (error) {
      console.error("[presence]", error);
      // Non-fatal — presence is best-effort
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Presence is best-effort; don't propagate errors
    return NextResponse.json({ ok: false });
  }
}
