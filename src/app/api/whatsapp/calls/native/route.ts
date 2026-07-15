import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { ConnectorClient } from "livekit-server-sdk";
import { RoomAgentDispatch } from "@livekit/protocol";
import { normalizeLiveKitHttpUrl } from "@/lib/livekit/normalize-url";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createAdminClient();
    // const { data: { user }, error: authError } = await supabase.auth.getUser();
    // if (authError || !user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    const { contactId, phone } = await req.json();

    if (!contactId || !phone) {
      return NextResponse.json({ error: "Missing contactId or phone" }, { status: 400 });
    }

    // Insert call record in Supabase whatsapp_calls (Bypassed for local CLI testing)
    // const { data: callRecord, error: insertError } = await supabase
    //   .from("whatsapp_calls")
    //   .insert({
    //     contact_id: contactId,
    //     phone_number: phone,
    //     direction: "outbound",
    //     status: "connecting",
    //   })
    //   .select()
    //   .single();
    
    // if (insertError) {
    //   console.error("DB insert error:", insertError);
    //   return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
    // }

    // Fake call record for testing
    const callRecord = { id: "test-call-123" };

    const lkUrl = process.env.LIVEKIT_URL;
    const lkApiKey = process.env.LIVEKIT_API_KEY;
    const lkApiSecret = process.env.LIVEKIT_API_SECRET;
    const metaPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
    const metaAccessToken = process.env.META_ACCESS_TOKEN;

    if (!lkUrl || !lkApiKey || !lkApiSecret || !metaPhoneNumberId || !metaAccessToken) {
      return NextResponse.json({ error: "Missing required LiveKit or Meta credentials in .env" }, { status: 500 });
    }

    const connector = new ConnectorClient(
      normalizeLiveKitHttpUrl(lkUrl),
      lkApiKey,
      lkApiSecret
    );

    const roomName = `wa-outbound-${callRecord.id}`;

    // Metadata for the voice-worker
    const metadata = JSON.stringify({
      inbound: false,
      phone_number: phone,
      call_id: callRecord.id,
    });

    console.log("[WhatsApp LiveKit] Initiating outbound native call", { roomName, to: phone });

    // Note: LiveKit server SDK method for creating outbound WhatsApp call
    const response = await connector.dialWhatsAppCall({
      whatsappPhoneNumberId: metaPhoneNumberId,
      whatsappApiKey: metaAccessToken,
      whatsappCloudApiVersion: "24.0",
      whatsappToPhoneNumber: phone,
      roomName: roomName,
      agents: [
        new RoomAgentDispatch({
          agentName: "outbound-caller", // target voice-worker/agent.py
          metadata: metadata,
        }),
      ],
    });

    // Update call record with LiveKit roomName (Bypassed for local CLI testing)
    // await supabase
    //   .from("whatsapp_calls")
    //   .update({
    //     meta_call_id: response.roomName || roomName,
    //     status: "ringing",
    //   })
    //   .eq("id", callRecord.id);

    return NextResponse.json({
      ok: true,
      call_id: callRecord.id,
      roomName: response.roomName || roomName,
    });
  } catch (err: any) {
    console.error("Initiate Native WhatsApp Call Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
