import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function geminiLiveLanguage(languagePreset?: string, sarvamLanguage?: string) {
  if (languagePreset?.startsWith("en")) return "en";
  if (languagePreset === "hinglish") return "hi";
  if (languagePreset) return languagePreset;
  return sarvamLanguage?.slice(0, 2) || "hi";
}

// Gemini Live WebSocket API only supports these 5 voices.
// The extended voice set (Zephyr, Leda, Achernar, etc.) belongs to Google's
// REST TTS API — passing them to the Live API causes an immediate session
// rejection which manifests as an instant call hang-up.
const GEMINI_LIVE_SUPPORTED_VOICES = new Set([
  "Puck", "Charon", "Kore", "Fenrir", "Aoede",
]);

// Map extended voices to the nearest supported Live voice by style similarity.
const GEMINI_LIVE_VOICE_FALLBACK: Record<string, string> = {
  Zephyr: "Puck",        // Bright → Upbeat
  Leda: "Aoede",         // Youthful → Breezy
  Orus: "Kore",          // Firm → Firm
  Callirrhoe: "Aoede",   // Easy-going → Breezy
  Autonoe: "Puck",       // Bright → Upbeat
  Enceladus: "Aoede",    // Breathy → Breezy
  Iocaste: "Charon",     // Informative → Informative
  Umbriel: "Aoede",      // Easy-going → Breezy
  Algieba: "Charon",     // Smooth → Calm
  Despina: "Aoede",      // Smooth → Breezy
  Erinome: "Charon",     // Clear → Informative
  Algenib: "Fenrir",     // Gravelly → Excitable
  Rasalghul: "Charon",   // Informative → Informative
  Laomedeia: "Puck",     // Upbeat → Upbeat
  Achernar: "Aoede",     // Soft → Breezy
  Alnilam: "Kore",       // Firm → Firm
  Schedar: "Charon",     // Even → Informative
  Gacrux: "Charon",      // Mature → Calm
  Pulcherrima: "Fenrir", // Forward → Excitable
  Achird: "Puck",        // Friendly → Upbeat
  Zubenelgenubi: "Aoede",// Casual → Breezy
  Vindemiatrix: "Aoede", // Gentle → Breezy
  Sadachbia: "Fenrir",   // Lively → Excitable
  Sulafat: "Aoede",      // Warm → Breezy
  Sadaltager: "Charon",  // Knowledgeable → Informative
};

/**
 * Ensure the voice ID is valid for Gemini Live WebSocket API.
 * Extended Google voices only work with the REST TTS API, not the Live API.
 * Falls back gracefully to the nearest supported voice instead of crashing.
 */
function sanitizeGeminiLiveVoice(voiceId: string): string {
  if (GEMINI_LIVE_SUPPORTED_VOICES.has(voiceId)) return voiceId;
  const fallback = GEMINI_LIVE_VOICE_FALLBACK[voiceId];
  if (fallback) {
    console.warn(`[dial] Voice "${voiceId}" is not supported by Gemini Live API. Falling back to "${fallback}".`);
    return fallback;
  }
  // Unknown voice — safe default
  console.warn(`[dial] Unknown Gemini voice "${voiceId}". Defaulting to "Puck".`);
  return "Puck";
}

// Default Hinglish greeting — used when agent has no first_message configured.
// Must contain Hindi words so Sarvam hi-IN TTS accepts it.
const DEFAULT_FIRST_MESSAGE =
  "Haan, namaste! Main aapki kaise help kar sakti hoon aaj?";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      toNumber,
      agentType = "livekit",
      voiceId = "anushka",
      systemPrompt,
      voiceIntent,
      deepgramLanguage,
      sarvamLanguage,
      languagePreset,
      presetId,
    } = body;

    if (
      !toNumber ||
      !/^[0-9+\s\-()]{6,15}$/.test(toNumber.replace(/\s/g, ""))
    ) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    // ── Resolve workspace ────────────────────────────────────────────────────
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = member?.workspace_id ?? null;

    // ── Resolve voice agent config from DB (first_message, system_prompt) ───
    let resolvedFirstMessage = DEFAULT_FIRST_MESSAGE;
    let resolvedSystemPrompt = systemPrompt || "";

    if (workspaceId) {
      const { data: agent } = await supabase
        .from("voice_agents")
        .select("first_message, system_prompt")
        .eq("workspace_id", workspaceId)
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();

      if (agent?.first_message) resolvedFirstMessage = agent.first_message;
      if (!resolvedSystemPrompt && agent?.system_prompt)
        resolvedSystemPrompt = agent.system_prompt;
    }

    // ── Resolve Dograh workflow ID ───────────────────────────────────────────
    let dograhWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10);

    if (workspaceId) {
      const { data: voiceConn } = await supabase
        .from("channel_connections")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("type", "voice")
        .maybeSingle();

      if (voiceConn?.config?.dograhWorkflowId) {
        const parsed = parseInt(voiceConn.config.dograhWorkflowId, 10);
        if (!isNaN(parsed)) dograhWorkflowId = parsed;
      }
    }

    if (presetId) {
      const { data: preset } = await supabase
        .from("voice_agents")
        .select("dograh_workflow_id")
        .eq("id", presetId)
        .maybeSingle();
      if (preset?.dograh_workflow_id) {
        dograhWorkflowId = preset.dograh_workflow_id;
      }
    } else if (workspaceId) {
      const { data: defaultAgent } = await supabase
        .from("voice_agents")
        .select("dograh_workflow_id")
        .eq("workspace_id", workspaceId)
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();
      if (defaultAgent?.dograh_workflow_id) {
        dograhWorkflowId = defaultAgent.dograh_workflow_id;
      }
    }

    // ── Insert call record ───────────────────────────────────────────────────
    const { data: callRecord, error: insertError } = await supabase
      .from("voice_calls")
      .insert({
        user_id: user.id,
        workspace_id: workspaceId,        // store workspace for multi-tenant queries
        phone_number: toNumber,
        agent_type: agentType,
        voice_id: voiceId,
        status: "initiated",
      })
      .select()
      .single();

    if (insertError) {
      // If workspace_id column doesn't exist yet, retry without it
      const { data: fallback, error: fallbackErr } = await supabase
        .from("voice_calls")
        .insert({
          user_id: user.id,
          phone_number: toNumber,
          agent_type: agentType,
          voice_id: voiceId,
          status: "initiated",
        })
        .select()
        .single();
      if (fallbackErr) {
        console.error("DB insert error:", fallbackErr);
        return NextResponse.json(
          { error: "Failed to create call record" },
          { status: 500 }
        );
      }
      Object.assign(callRecord ?? {}, fallback);
    }

    // ── Build model_overrides ────────────────────────────────────────────────
    // For Gemini Live (realtime) → send full realtime override.
    // For Sarvam+LLM stack     → ONLY send TTS voice/language so Flowra controls
    //                            the voice, but Dograh's BYOK decides LLM + STT.
    //                            Never hardcode a specific LLM here.
    let modelOverrides: Record<string, any>;

    if (agentType === "gemini") {
      // Sanitize voice: extended Google voices (Zephyr, Achernar, etc.) are
      // only supported by the REST TTS API, NOT the Live WebSocket API.
      // Passing an unsupported voice causes Google to reject the session,
      // which manifests as an immediate call hang-up on pickup.
      const liveVoice = sanitizeGeminiLiveVoice(voiceId);
      modelOverrides = {
        is_realtime: true,
        realtime: {
          provider: "google_realtime",
          // Do NOT hardcode model here — the org's BYOK config has the correct
          // current model (gemini-3.1-flash-live-preview). Overriding with the
          // deprecated gemini-2.0-flash-live-001 causes all calls to fail with
          // "not found for API version v1beta".
          voice: liveVoice,
          language: geminiLiveLanguage(languagePreset, sarvamLanguage),
        },
      };
    } else {
      // Non-realtime: let Dograh BYOK handle LLM + STT.
      // Only override TTS voice so the agent's selected voice is respected.
      modelOverrides = {
        is_realtime: false,
        tts: {
          voice: voiceId,
          language: sarvamLanguage || "hi-IN",
          // provider intentionally omitted → Dograh uses its BYOK TTS provider
        },
      };
    }

    // ── Build initial_context ────────────────────────────────────────────────
    const initialContext: Record<string, any> = {
      system_prompt: resolvedSystemPrompt,
      first_message: resolvedFirstMessage,   // always non-empty → Sarvam won't 400
      model_overrides: modelOverrides,
    };

    if (voiceIntent) initialContext.call_objective = voiceIntent;

    // ── Call Dograh ──────────────────────────────────────────────────────────
    const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000";
    const flowraSecret =
      process.env.DOGRAH_SECRET ||
      process.env.DOGRAH_API_SECRET ||
      "change-me-in-production";

    const dograhRes = await fetch(
      `${dograhUrl}/api/v1/telephony/initiate-call`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Flowra-Secret": flowraSecret,
        },
        body: JSON.stringify({
          workflow_id: dograhWorkflowId,
          phone_number: toNumber,
          metadata: {
            flowra_source: "manual_dialer",
            preset_id: presetId || null,
            workspace_id: workspaceId
          },
          initial_context: initialContext,
        }),
      }
    );

    if (!dograhRes.ok) {
      const errText = await dograhRes.text();
      throw new Error(`Dograh API error: ${errText}`);
    }

    const dograhData = await dograhRes.json();

    // Dograh now returns { message, workflow_run_id, workflow_run_name }
    // livekit_sip_call_id is reused to store the Dograh workflow_run_id
    const workflowRunId = dograhData.workflow_run_id
      ? String(dograhData.workflow_run_id)
      : null;

    await supabase
      .from("voice_calls")
      .update({
        livekit_room_name: workflowRunId ? `run-${workflowRunId}` : null,
        livekit_sip_call_id: workflowRunId,
        status: "ringing",
      })
      .eq("id", (callRecord as any).id);

    return NextResponse.json({
      ok: true,
      callId: (callRecord as any).id,
      workflowRunId: dograhData.workflow_run_id,
      workflowRunName: dograhData.workflow_run_name,
    });
  } catch (err: any) {
    console.error("Dial error:", err);
    return NextResponse.json(
      { error: err.message || "Call failed" },
      { status: 502 }
    );
  }
}