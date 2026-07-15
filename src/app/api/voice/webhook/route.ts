import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { getLiveKitClients } from "@/lib/livekit";
import fs from "fs";
import path from "path";

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

    const { event, room, egress_info, participant } = eventPayload;
    console.log(`[LiveKit Webhook] Received event: "${event}" for room: "${room?.name || "none"}", participant: "${participant?.identity || "none"}"`);
    fs.appendFileSync(path.join(process.cwd(), "webhook_log.txt"), JSON.stringify({ event, roomName: room?.name, payload: eventPayload }, null, 2) + "\n\n");

    const supabase = await createAdminClient();

    // Inbound call: dispatch agent when a room created by the SIP dispatch rule appears
    if (event === "room_started" && (room?.name?.startsWith("inbound-") || room?.name?.startsWith("whatsapp-inbound-"))) {
      try {
        const { agentClient } = await getLiveKitClients();
        await agentClient.createDispatch(room.name, "outbound-caller", {
          metadata: room.metadata || "",
        });
        console.log(`[inbound] Agent dispatched to room ${room.name}`);
      } catch (e) {
        console.error("[inbound] Failed to dispatch agent:", e);
      }
    }

    if (event === "room_finished" && room?.name) {
      // Mark call completed
      const { data: voiceCall } = await supabase
        .from("voice_calls")
        .select("id")
        .eq("livekit_room_name", room.name)
        .maybeSingle();

      if (voiceCall) {
        await supabase
          .from("voice_calls")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("livekit_room_name", room.name)
          .in("status", ["ringing", "active", "initiated"]);
      } else {
        await supabase
          .from("whatsapp_calls")
          .update({
            status: "terminated",
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("meta_call_id", room.name)
          .in("status", ["connecting", "ringing", "connected"]);
      }
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
          const { data: voiceCall } = await supabase
            .from("voice_calls")
            .select("id")
            .eq("livekit_room_name", roomName)
            .maybeSingle();

          if (voiceCall) {
            await supabase
              .from("voice_calls")
              .update({ recording_url: data.publicUrl, updated_at: new Date().toISOString() })
              .eq("livekit_room_name", roomName);
          } else {
            await supabase
              .from("whatsapp_calls")
              .update({ recording_url: data.publicUrl, updated_at: new Date().toISOString() })
              .eq("meta_call_id", roomName);
          }
        }
      }
    }

    if (event === "participant_joined" && room?.name) {
      if (room.name.startsWith("whatsapp-inbound-")) {
        try {
          const identity = participant?.identity;
          let phone = "";
          if (identity && identity.startsWith("sip_")) {
            phone = identity.replace(/^sip_whatsapp_/, "").replace(/^sip_/, "").replace(/^\+/, "").trim();
          }
          if (phone) {
            // Find channel connection to get workspace ID
            const { data: conn } = await supabase
              .from("channel_connections")
              .select("workspace_id")
              .eq("type", "whatsapp")
              .limit(1)
              .maybeSingle();

            const workspaceId = conn?.workspace_id;
            if (workspaceId) {
              // Find or create contact
              let { data: contact } = await supabase
                .from("contacts")
                .select("id")
                .eq("workspace_id", workspaceId)
                .eq("phone", phone)
                .maybeSingle();

              if (!contact) {
                const { data: newContact } = await supabase.from("contacts").insert({
                  workspace_id: workspaceId,
                  phone: phone,
                  full_name: phone,
                  channel: "whatsapp",
                }).select("id").single();
                contact = newContact;
              }

              if (contact) {
                // Check if call already exists to prevent duplicate insertion
                const { data: existingCall } = await supabase
                  .from("whatsapp_calls")
                  .select("id")
                  .eq("meta_call_id", room.name)
                  .maybeSingle();

                if (!existingCall) {
                  await supabase.from("whatsapp_calls").insert({
                    contact_id: contact.id,
                    phone_number: phone,
                    meta_call_id: room.name,
                    direction: "inbound",
                    status: "connected",
                    started_at: new Date().toISOString(),
                  });
                  console.log(`[inbound] Registered inbound WhatsApp call for +${phone} in room ${room.name}`);
                }
              }
            }
          }
        } catch (err) {
          console.error("[inbound] Failed to process inbound WhatsApp call participant_joined:", err);
        }
      } else {
        // Mark call active when SIP participant joins
        const { data: voiceCall } = await supabase
          .from("voice_calls")
          .select("id")
          .eq("livekit_room_name", room.name)
          .maybeSingle();

        if (voiceCall) {
          await supabase
            .from("voice_calls")
            .update({ status: "active", updated_at: new Date().toISOString() })
            .eq("livekit_room_name", room.name)
            .eq("status", "ringing");
        } else {
          await supabase
            .from("whatsapp_calls")
            .update({
              status: "connected",
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("meta_call_id", room.name)
            .eq("status", "ringing");
        }
      }
    }

    if (event === "participant_left" && room?.name) {
      console.log(`[webhook] Participant left room ${room.name}. Deleting room to free SIP channel.`);
      try {
        const { roomService } = await getLiveKitClients();
        await roomService.deleteRoom(room.name);
      } catch (e) {
        console.error(`[webhook] Failed to delete room ${room.name} on participant_left:`, e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
