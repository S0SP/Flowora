import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initiateVoiceCall } from "@/services/voice";

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

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = member?.workspace_id;
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const result = await initiateVoiceCall({
      supabase,
      workspaceId,
      userId: user.id,
      toNumber,
      agentType,
      voiceId,
      systemPrompt,
      voiceIntent,
      deepgramLanguage,
      sarvamLanguage,
      languagePreset,
      presetId,
      metadataSource: "manual_dialer"
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Dial error:", err);
    return NextResponse.json(
      { error: err.message || "Call failed" },
      { status: 502 }
    );
  }
}