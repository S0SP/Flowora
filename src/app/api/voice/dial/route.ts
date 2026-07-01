import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dialSip, startEgressRecording } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { toNumber, agentType = "livekit", voiceId = "anushka", systemPrompt } = body;

    if (!toNumber || !/^[0-9+\s\-()]{6,15}$/.test(toNumber.replace(/\s/g, ""))) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    // Insert call record in Supabase
    const { data: callRecord, error: insertError } = await supabase
      .from("voice_calls")
      .insert({
        user_id: user.id,
        to_number: toNumber,
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

    // Place SIP call via LiveKit
    const { roomName, sipCallId } = await dialSip({
      toNumber,
      userId: user.id,
      agentType,
      voiceId,
      systemPrompt,
      callId: callRecord.id,
    });

    // Update call record with LiveKit details
    await supabase
      .from("voice_calls")
      .update({ livekit_room_name: roomName, livekit_sip_call_id: sipCallId, status: "ringing" })
      .eq("id", callRecord.id);

    // Start Egress Recording (non-blocking)
    startEgressRecording(roomName, callRecord.id).catch(e => {
      console.error("Failed to start egress recording:", e);
    });

    return NextResponse.json({
      ok: true,
      callId: callRecord.id,
      roomName,
      sipCallId,
    });
  } catch (err: any) {
    console.error("Dial error:", err);
    return NextResponse.json({ error: err.message || "Call failed" }, { status: 502 });
  }
}
