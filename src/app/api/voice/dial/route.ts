import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function geminiLiveLanguage(languagePreset?: string, sarvamLanguage?: string) {
  if (languagePreset?.startsWith("en")) return "en";
  if (languagePreset === "hinglish") return "hi";
  if (languagePreset) return languagePreset;
  return sarvamLanguage?.slice(0, 2) || "hi";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      toNumber,
      agentType = "livekit",
      voiceId = "anushka",
      systemPrompt,
      deepgramLanguage,
      sarvamLanguage,
      languagePreset,
    } = body;

    if (!toNumber || !/^[0-9+\s\-()]{6,15}$/.test(toNumber.replace(/\s/g, ""))) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    // Insert call record in Supabase
    const { data: callRecord, error: insertError } = await supabase
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

    if (insertError) {
      console.error("DB insert error:", insertError);
      return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
    }

    // Place outbound call via Dograh Backend API
    const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000";
    const flowraSecret =
      process.env.DOGRAH_SECRET ||
      process.env.DOGRAH_API_SECRET ||
      "change-me-in-production";
      
    // Fetch workspace_id for the user
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let dograhWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10);

    if (member?.workspace_id) {
      // Fetch voice channel connection to get Dograh Workflow ID
      const { data: voiceConn } = await supabase
        .from("channel_connections")
        .select("config")
        .eq("workspace_id", member.workspace_id)
        .eq("type", "voice")
        .maybeSingle();

      if (voiceConn?.config?.dograhWorkflowId) {
        const parsedId = parseInt(voiceConn.config.dograhWorkflowId, 10);
        if (!isNaN(parsedId)) {
          dograhWorkflowId = parsedId;
        }
      }
    }

    const modelOverrides = agentType === "gemini"
      ? {
          is_realtime: true,
          realtime: {
            provider: "google_realtime",
            model: "gemini-3.1-flash-live-preview",
            voice: voiceId,
            language: geminiLiveLanguage(languagePreset, sarvamLanguage),
          },
        }
      : {
          is_realtime: false,
          tts: {
            provider: "sarvam",
            voice: voiceId,
            language: sarvamLanguage || "hi-IN",
          },
          llm: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
          },
        };

    const initialContext = {
      system_prompt: systemPrompt || "",
      first_message: "",
      model_overrides: modelOverrides,
    };

    const dograhRes = await fetch(`${dograhUrl}/api/v1/telephony/initiate-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Flowra-Secret": flowraSecret,
      },
      body: JSON.stringify({
        workflow_id: dograhWorkflowId,
        phone_number: toNumber,
        initial_context: initialContext,
      }),
    });

    if (!dograhRes.ok) {
      const errText = await dograhRes.text();
      throw new Error(`Dograh API error: ${errText}`);
    }

    const dograhData = await dograhRes.json();

    // Update call record with Dograh run details
    await supabase
      .from("voice_calls")
      .update({
        livekit_room_name: `run-${dograhData.workflow_run_id}`,
        livekit_sip_call_id: String(dograhData.workflow_run_id),
        status: "ringing",
      })
      .eq("id", callRecord.id);

    return NextResponse.json({
      ok: true,
      callId: callRecord.id,
      workflowRunId: dograhData.workflow_run_id,
      workflowRunName: dograhData.workflow_run_name,
    });
  } catch (err: any) {
    console.error("Dial error:", err);
    return NextResponse.json({ error: err.message || "Call failed" }, { status: 502 });
  }
}
