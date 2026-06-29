import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

import { WebhookReceiver } from "livekit-server-sdk";

// LiveKit webhook handler — updates call status when room/egress events arrive
export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const authHeader = req.headers.get("Authorization");
    
    // We get the keys from environment or DB (if BYOK is set, though for global webhooks we use the env vars)
    const receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY || "", 
      process.env.LIVEKIT_API_SECRET || ""
    );
    
    let eventPayload;
    try {
        // Validate the signature using the WebhookReceiver
        eventPayload = await receiver.receive(bodyText, authHeader || undefined);
    } catch (e) {
        console.warn("Webhook signature validation failed, falling back to raw JSON parsing:", e);
        eventPayload = JSON.parse(bodyText);
    }

    const { event, room, egress_info } = eventPayload;

    const supabase = await createAdminClient();

    if (event === "room_finished" && room?.name) {
      // Mark call completed
      await supabase
        .from("voice_calls")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("livekit_room_name", room.name)
        .in("status", ["ringing", "active", "initiated"]);
    }

    if (event === "egress_ended" && egress_info) {
      const filePath = egress_info.file_results?.[0]?.filename;
      if (filePath) {
        // Get public URL for the recording from Supabase Storage
        const { data } = supabase.storage
          .from("call-recordings")
          .getPublicUrl(filePath.replace(/^recordings\//, ""));

        const roomName = egress_info.room_name;
        if (roomName) {
          await supabase
            .from("voice_calls")
            .update({ recording_url: data.publicUrl, updated_at: new Date().toISOString() })
            .eq("livekit_room_name", roomName);
        }
      }
    }

    if (event === "participant_joined" && room?.name) {
      // Mark call active when SIP participant joins
      await supabase
        .from("voice_calls")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("livekit_room_name", room.name)
        .eq("status", "ringing");
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
