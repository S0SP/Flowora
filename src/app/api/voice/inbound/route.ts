import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveKitClients } from "@/lib/livekit";

// GET — list current dispatch rules
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    return NextResponse.json({ rules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create inbound dispatch rule so callers reach the AI agent
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const voiceId = body.voiceId || "sumit";
    const agentType = body.agentType || "livekit";

    const { sipClient } = await getLiveKitClients();

    // createSipDispatchRule(rule, opts) — two separate args, rule has `type` field
    const rule = await sipClient.createSipDispatchRule(
      {
        type: "individual",   // each caller gets their own room
        roomPrefix: "inbound-",
      },
      {
        name: "ai-inbound-handler",
        trunkIds: [],         // empty = applies to all inbound trunks
        metadata: JSON.stringify({
          inbound: true,
          model_provider: agentType === "gemini" ? "gemini" : "groq",
          voice_id: voiceId,
          tts_provider: "sarvam",
        }),
      }
    );

    return NextResponse.json({ ok: true, ruleId: rule.sipDispatchRuleId, rule });
  } catch (err: any) {
    console.error("Inbound setup error:", err);
    return NextResponse.json({ error: err.message, detail: String(err) }, { status: 500 });
  }
}

// DELETE — remove all dispatch rules
export async function DELETE(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    await Promise.all(rules.map(r => sipClient.deleteSipDispatchRule(r.sipDispatchRuleId)));
    return NextResponse.json({ ok: true, deleted: rules.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
