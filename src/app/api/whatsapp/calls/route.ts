import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dialSip, startEgressRecording } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { contactId, phone, type } = await req.json();

    if (!contactId || !phone) {
      return NextResponse.json({ error: "Missing contactId or phone" }, { status: 400 });
    }

    // Insert call record in Supabase whatsapp_calls
    const { data: callRecord, error: insertError } = await supabase
      .from("whatsapp_calls")
      .insert({
        contact_id: contactId,
        phone_number: phone,
        direction: "outbound",
        status: "connecting",
      })
      .select()
      .single();

    if (insertError) {
      console.error("DB insert error:", insertError);
      return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
    }

    // Fetch the workspace settings or prompt for the voice agent
    const { data: voiceAgent } = await supabase
      .from("voice_agent_settings")
      .select("voice_id, agent_type, language_preset, sarvam_language, deepgram_language, system_prompt")
      .limit(1)
      .maybeSingle();

    const agentType = voiceAgent?.agent_type || "livekit";
    const voiceId = voiceAgent?.voice_id || "anushka";
    const systemPrompt = voiceAgent?.system_prompt || "You are a helpful AI voice assistant calling on WhatsApp...";

    // Place call via LiveKit SIP
    const { roomName, sipCallId } = await dialSip({
      toNumber: phone,
      userId: user.id,
      agentType: agentType as "livekit" | "gemini",
      voiceId,
      systemPrompt,
      callId: callRecord.id,
      deepgramLanguage: voiceAgent?.deepgram_language || "multi",
      sarvamLanguage: voiceAgent?.sarvam_language || "hi-IN",
      languagePreset: voiceAgent?.language_preset || "hinglish",
      isWhatsApp: true,
    });

    // Update call record with LiveKit roomName as meta_call_id
    await supabase
      .from("whatsapp_calls")
      .update({
        meta_call_id: roomName,
        status: "ringing",
      })
      .eq("id", callRecord.id);

    // Start Egress Recording (non-blocking)
    startEgressRecording(roomName, callRecord.id).catch((e) => {
      console.error("Failed to start egress recording:", e);
    });

    return NextResponse.json({
      ok: true,
      call_id: callRecord.id,
      roomName,
      sipCallId,
    });
  } catch (err: any) {
    console.error("Initiate WhatsApp Call Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
