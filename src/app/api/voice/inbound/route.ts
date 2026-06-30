import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveKitClients } from "@/lib/livekit";

// GET — list current dispatch rules (useful for debugging)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    return NextResponse.json({ rules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, detail: String(err) }, { status: 500 });
  }
}

// POST — create inbound dispatch rule so callers reach the AI agent
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const voiceId = body.voiceId || "anushka";
    const agentType = body.agentType || "livekit";

    const { sipClient } = await getLiveKitClients();

    const metadata = JSON.stringify({
      inbound: true,
      model_provider: agentType === "gemini" ? "gemini" : "groq",
      voice_id: voiceId,
      tts_provider: "sarvam",
    });

    // trunkIds left empty → rule applies to ALL inbound trunks.
    // The outbound SIP trunk ID must NOT be passed here — it's a different entity.
    let rule: any;
    let lastError: any;

    // Try the protobuf-es oneof format first (livekit-server-sdk v2)
    try {
      rule = await sipClient.createSipDispatchRule({
        name: "ai-inbound-handler",
        trunkIds: [],
        rule: {
          case: "dispatchRuleIndividual",
          value: { roomNamePrefix: "inbound-" },
        },
        metadata,
      } as any);
    } catch (e1: any) {
      lastError = e1;
      // Fallback: try dispatchRuleDirect format
      try {
        rule = await sipClient.createSipDispatchRule({
          name: "ai-inbound-handler",
          trunkIds: [],
          rule: {
            case: "dispatchRuleDirect",
            value: { roomName: "inbound-{callerNumber}" },
          },
          metadata,
        } as any);
      } catch (e2: any) {
        // Return both errors so we can debug
        return NextResponse.json({
          error: "Both dispatch rule formats failed",
          errorIndividual: e1?.message,
          errorDirect: e2?.message,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, ruleId: rule.sipDispatchRuleId, rule });
  } catch (err: any) {
    console.error("Inbound setup error:", err);
    return NextResponse.json({ error: err.message, detail: String(err) }, { status: 500 });
  }
}

// DELETE — remove all dispatch rules (reset/start over)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    await Promise.all(rules.map(r => sipClient.deleteSipDispatchRule(r.sipDispatchRuleId)));
    return NextResponse.json({ ok: true, deleted: rules.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, detail: String(err) }, { status: 500 });
  }
}
