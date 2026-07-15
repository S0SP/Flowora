import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// GET — load voice agent settings for this workspace
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data } = await admin
      .from("voice_agent_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    return NextResponse.json({ settings: data ?? null });
  } catch (err) {
    return NextResponse.json({ settings: null });
  }
}

// POST — save voice agent settings
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const admin = await createAdminClient();

    const upsertData = {
      workspace_id: workspaceId,
      voice_id: body.voiceId ?? "anushka",
      agent_type: body.agentType ?? "livekit",
      language_preset: body.languagePreset ?? "hinglish",
      sarvam_language: body.sarvamLanguage ?? "hi-IN",
      deepgram_language: body.deepgramLanguage ?? "hi",
      system_prompt: body.systemPrompt ?? "",
      call_objective: body.callObjective ?? "",
      calling_hours_start: body.callingHoursStart ?? "09:00",
      calling_hours_end: body.callingHoursEnd ?? "19:00",
      max_call_attempts: body.maxCallAttempts ?? 3,
      retry_interval_minutes: body.retryIntervalMinutes ?? 60,
      recording_enabled: body.recordingEnabled ?? true,
      transcription_enabled: body.transcriptionEnabled ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("voice_agent_settings")
      .upsert(upsertData, { onConflict: "workspace_id" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ settings: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
