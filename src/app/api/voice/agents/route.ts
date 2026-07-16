import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// GET — list all voice agent presets for this workspace
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("voice_agents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ agents: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create a new voice agent preset
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const admin = await createAdminClient();

    if (!body.name) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    const insertData = {
      workspace_id: workspaceId,
      name: body.name,
      agent_type: body.agentType ?? "livekit",
      voice_id: body.voiceId ?? "anushka",
      system_prompt: body.systemPrompt ?? "",
      first_message: body.firstMessage ?? "",
      config: {
        call_objective: body.callObjective ?? "",
        language_preset: body.languagePreset ?? "hinglish",
        sarvam_language: body.sarvamLanguage ?? "hi-IN",
        deepgram_language: body.deepgramLanguage ?? "hi",
        calling_hours_start: body.callingHoursStart ?? "09:00",
        calling_hours_end: body.callingHoursEnd ?? "19:00",
        max_call_attempts: body.maxCallAttempts ?? 3,
        retry_interval_minutes: body.retryIntervalMinutes ?? 60,
        recording_enabled: body.recordingEnabled ?? true,
        transcription_enabled: body.transcriptionEnabled ?? true,
      },
    };

    const { data, error } = await admin
      .from("voice_agents")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ agent: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
