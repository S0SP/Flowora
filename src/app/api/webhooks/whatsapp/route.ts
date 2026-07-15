import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { generateRagResponse } from "@/services/rag"
import { applyRoutingRules } from "@/app/api/inbox/routing/helper"
import { ConnectorClient } from "livekit-server-sdk"
import { RoomAgentDispatch, SessionDescription } from "@livekit/protocol"
import { parseInboundCallEvents, isConnectCallEvent, WhatsAppInboundCallEvent } from "@/lib/whatsapp-call-webhook"
import { normalizeLiveKitHttpUrl } from "@/lib/livekit/normalize-url"

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? "flowora_webhook_verify"

// GET — WhatsApp webhook verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp Webhook] Verified")
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

// POST — Receive incoming WhatsApp messages
export async function POST(req: NextRequest) {
  const body = await req.json()
  const admin = await createAdminClient()

  console.log('[WhatsApp Webhook] Received body:', JSON.stringify(body, null, 2));

  // ── Handle Native WhatsApp WebRTC Calls (LiveKit) ──────────────
  try {
    const callEvents = parseInboundCallEvents(body);
    for (const callEv of callEvents) {
      if (isConnectCallEvent(callEv) && callEv.session) {
        handleNativeLivekitCall(callEv, admin).catch((err) =>
          console.error("[WhatsApp LiveKit] Native accept failed:", err)
        );
      }
    }
  } catch (e) {
    console.error("[WhatsApp LiveKit] Parse error:", e);
  }

  const entries = body?.entry ?? []

  for (const entry of entries) {
    const changes = entry?.changes ?? []
    for (const change of changes) {
      const value = change?.value
      if (!value) continue

      const phoneNumberId: string = value.metadata?.phone_number_id
      const messages: any[] = value.messages ?? []
      const contacts: any[] = value.contacts ?? []
      const statuses: any[] = value.statuses ?? []

      // ── Handle incoming messages ─────────────────────────────────────────
      for (const msg of messages) {
        const waId: string = msg.from
        const waName = contacts.find((c: any) => c.wa_id === waId)?.profile?.name ?? null

        // Find workspace by phone_number_id
        const { data: channelConn } = await admin
          .from("channel_connections")
          .select("workspace_id, id, config")
          .eq("type", "whatsapp")
          .filter("config->phoneNumberId", "eq", phoneNumberId)
          .single()

        let conn = channelConn
        if (!conn) {
          // Try without workspace filter (legacy setup)
          const { data: legacyConn } = await admin
            .from("channel_connections")
            .select("workspace_id, id, config")
            .eq("type", "whatsapp")
            .single()

          if (!legacyConn) {
            console.warn("[WhatsApp Webhook] No workspace for phone_number_id:", phoneNumberId)
            continue
          }
          conn = legacyConn
        }

        const workspaceId: string = conn.workspace_id

        // Find or create contact
        let { data: contact } = await admin
          .from("contacts")
          .select("id, full_name")
          .eq("workspace_id", workspaceId)
          .eq("phone", waId)
          .single()

        if (!contact) {
          const { data: newContact } = await admin.from("contacts").insert({
            workspace_id: workspaceId,
            phone: waId,
            full_name: waName ?? waId,
            channel: "whatsapp",
          }).select("id, full_name").single()
          contact = newContact
        }

        if (!contact) continue

        // Find or create open thread
        let { data: thread } = await admin
          .from("threads")
          .select("id, ai_active, unread_count")
          .eq("workspace_id", workspaceId)
          .eq("contact_id", contact.id)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        let isNewThread = false
        if (!thread) {
          const { data: newThread } = await admin.from("threads").insert({
            workspace_id: workspaceId,
            contact_id: contact.id,
            channel: "whatsapp",
            status: "open",
            ai_active: true,
            channel_connection_id: conn.id,
          }).select("id, ai_active, unread_count").single()
          thread = newThread
          isNewThread = true
        }

        if (!thread) continue

        // Extract message content
        let content = ""
        let type = "text"
        let fileUrl: string | null = null
        let fileName: string | null = null

        if (msg.type === "text") {
          content = msg.text?.body ?? ""
        } else if (msg.type === "image") {
          type = "image"
          content = msg.image?.caption ?? ""
          fileUrl = msg.image?.id ?? null
        } else if (msg.type === "document") {
          type = "file"
          content = msg.document?.caption ?? ""
          fileUrl = msg.document?.id ?? null
          fileName = msg.document?.filename ?? null
        } else if (msg.type === "audio" || msg.type === "voice") {
          type = "audio"
          fileUrl = msg.audio?.id ?? msg.voice?.id ?? null
        } else if (msg.type === "video") {
          type = "video"
          content = msg.video?.caption ?? ""
          fileUrl = msg.video?.id ?? null
        } else {
          content = `[${msg.type} message]`
        }

        // Persist incoming message
        await admin.from("messages").insert({
          workspace_id: workspaceId,
          thread_id: thread.id,
          wa_message_id: msg.id,
          content,
          type,
          sender_type: "contact",
          sender_id: contact.id,
          status: "delivered",
          file_url: fileUrl,
          file_name: fileName,
          metadata: { waId, waName, raw: msg },
        })

        // Transition lead to "Contacted" if it was "new"
        try {
          const { data: leadRow } = await admin
            .from("leads")
            .select("id, status")
            .eq("workspace_id", workspaceId)
            .eq("contact_id", contact.id)
            .maybeSingle();

          if (leadRow && leadRow.status === "new") {
            const { data: contactedStage } = await admin
              .from("pipeline_stages")
              .select("id")
              .eq("workspace_id", workspaceId)
              .eq("name", "Contacted")
              .limit(1)
              .single();

            await admin
              .from("leads")
              .update({
                status: "contacted",
                stage_id: contactedStage?.id || null,
              })
              .eq("id", leadRow.id);
          }
        } catch (leadTransErr) {
          console.error("WhatsApp Webhook: failed to transition lead status:", leadTransErr);
        }

        // Update thread
        await admin.from("threads").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content.slice(0, 100),
          unread_count: (thread.unread_count ?? 0) + 1,
        }).eq("id", thread.id)

        // ── Smart routing on new threads ─────────────────────────────────
        if (isNewThread && msg.type === "text" && content.trim()) {
          applyRoutingRules({
            workspaceId,
            threadId: thread.id,
            message: content,
            contactId: contact.id,
            admin,
          }).catch(err => console.error("[WhatsApp Routing]", err))
        }

        // ── AI Auto-Reply ─────────────────────────────────────────────────
        if (thread.ai_active && msg.type === "text" && content.trim()) {
          // Run AI reply asynchronously to not block webhook response
          handleAiReply({
            workspaceId,
            threadId: thread.id,
            contactId: contact.id,
            toPhone: waId,
            userMessage: content,
            phoneNumberId,
            accessToken: (conn.config as any)?.accessToken ?? process.env.META_ACCESS_TOKEN ?? "",
          }).catch(err => console.error("[WhatsApp AI Reply]", err))
        }
      }

      // ── Handle message status updates ─────────────────────────────────
      for (const status of statuses) {
        const waMessageId = status.id
        const newStatus = status.status

        if (waMessageId && newStatus) {
          await admin.from("messages")
            .update({ status: newStatus })
            .eq("wa_message_id", waMessageId)
        }
      }

      // ── Handle WhatsApp Calling events ────────────────────────────────
      const calls: any[] = value.calls ?? []
      for (const call of calls) {
        const callId = call.id;
        const callStatus = call.status; // e.g. ringing, connected, terminated
        const timestamp = call.timestamp;

        if (callId) {
          // Check if this is an inbound call
          const { data: existingCall } = await admin
            .from("whatsapp_calls")
            .select("id")
            .eq("meta_call_id", callId)
            .single();

          if (existingCall) {
            // Update existing call status
            const updateData: any = { status: callStatus };
            if (callStatus === "terminated" || callStatus === "missed") {
              updateData.ended_at = new Date(timestamp ? parseInt(timestamp) * 1000 : Date.now()).toISOString();
            }
            await admin.from("whatsapp_calls").update(updateData).eq("meta_call_id", callId);
          } else if (call.from) {
            // New inbound call (User-initiated call)
            const waId: string = call.from;
            const phoneNumberId: string = value.metadata?.phone_number_id;

            // Find workspace by phone_number_id
            const { data: channelConn } = await admin
              .from("channel_connections")
              .select("workspace_id")
              .eq("type", "whatsapp")
              .filter("config->phoneNumberId", "eq", phoneNumberId)
              .maybeSingle();

            if (channelConn) {
              const workspaceId = channelConn.workspace_id;
              
              // Find contact
              let { data: contact } = await admin
                .from("contacts")
                .select("id")
                .eq("workspace_id", workspaceId)
                .eq("phone", waId)
                .maybeSingle();

              if (!contact) {
                 const { data: newContact } = await admin.from("contacts").insert({
                   workspace_id: workspaceId,
                   phone: waId,
                   full_name: waId,
                   channel: "whatsapp",
                 }).select("id").single();
                 contact = newContact;
              }

              if (contact) {
                await admin.from("whatsapp_calls").insert({
                  contact_id: contact.id,
                  phone_number: waId,
                  meta_call_id: callId,
                  direction: "inbound",
                  status: callStatus || "connecting",
                  started_at: new Date(timestamp ? parseInt(timestamp) * 1000 : Date.now()).toISOString()
                });
              }
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}

// ── AI Reply Handler ────────────────────────────────────────────────────────
async function handleAiReply(opts: {
  workspaceId: string
  threadId: string
  contactId: string
  toPhone: string
  userMessage: string
  phoneNumberId: string
  accessToken: string
}) {
  const admin = await createAdminClient()

  // Check FAQ for quick fixed answers (no LLM needed)
  const faqReply = await checkFAQ(opts.userMessage, opts.workspaceId, admin);
  if (faqReply) {
    await sendWhatsAppReply(opts, faqReply, admin, true);
    return;
  }

  // Load chatbot settings for this workspace
  const { data: settings } = await admin
    .from("chatbot_settings")
    .select("*")
    .eq("workspace_id", opts.workspaceId)
    .single()

  // If chatbot is disabled, skip
  if (settings && !settings.is_active) return
  if (settings && !settings.whatsapp_enabled) return

  // Load recent chat history (last 10 messages)
  const { data: recentMessages } = await admin
    .from("messages")
    .select("content, sender_type")
    .eq("thread_id", opts.threadId)
    .eq("type", "text")
    .order("created_at", { ascending: false })
    .limit(10)

  const chatHistory = (recentMessages ?? [])
    .reverse()
    .slice(0, -1) // exclude the current message (it will be the query)
    .map(m => ({
      role: (m.sender_type === "contact" ? "user" : "model") as "user" | "model",
      text: m.content ?? "",
    }))

  const persona = settings?.persona || `You are a helpful AI assistant. Be concise, friendly, and helpful. Answer customer questions accurately.`
  const fallback = settings?.fallback_message || "I'm sorry, I'm unable to help with that right now. A human agent will assist you shortly."
  const apiKey = settings?.gemini_api_key || process.env.GEMINI_API_KEY || ""

  // Generate RAG-powered response
  const { reply } = await generateRagResponse({
    query: opts.userMessage,
    workspaceId: opts.workspaceId,
    chatHistory,
    systemPersona: persona,
    fallbackMessage: fallback,
    apiKey,
    maxTokens: 512,
    temperature: 0.7,
  })

  if (!reply) return

  // Send reply via WhatsApp API helper
  await sendWhatsAppReply(opts, reply, admin, false)
}

// ── FAQ check — fast path, no LLM ─────────────────────────────────────────
async function checkFAQ(
  userMessage: string,
  workspaceId: string,
  admin: ReturnType<typeof createAdminClient> extends Promise<infer T> ? T : never
): Promise<string | null> {
  try {
    const { data: faqs } = await admin
      .from("chatbot_faqs")
      .select("question, answer, match_type")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(50);

    if (!faqs?.length) return null;

    const userLower = userMessage.toLowerCase().trim();

    for (const faq of faqs) {
      const qLower = faq.question.toLowerCase().trim();
      let matched = false;

      switch (faq.match_type) {
        case "exact":
          matched = userLower === qLower;
          break;
        case "starts_with":
          matched = userLower.startsWith(qLower);
          break;
        case "contains":
        default:
          matched = userLower.includes(qLower) || qLower.includes(userLower);
          break;
      }

      if (matched) return faq.answer;
    }

    return null;
  } catch {
    return null;
  }
}

// ── WhatsApp send + DB save ───────────────────────────────────────────────
async function sendWhatsAppReply(
  opts: { workspaceId: string; threadId: string; toPhone: string; phoneNumberId: string; accessToken: string },
  reply: string,
  admin: ReturnType<typeof createAdminClient> extends Promise<infer T> ? T : never,
  isFaq: boolean
): Promise<void> {
  const phoneNumId = opts.phoneNumberId || process.env.META_PHONE_NUMBER_ID
  const token = opts.accessToken || process.env.META_ACCESS_TOKEN

  if (!phoneNumId || !token) {
    console.warn("[WhatsApp Reply] Missing credentials")
    return
  }

  const metaRes = await fetch(
    `https://graph.facebook.com/v18.0/${phoneNumId}/messages`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: opts.toPhone,
        type: "text",
        text: { body: reply, preview_url: false },
      }),
    }
  )

  const metaData = await metaRes.json()
  if (!metaRes.ok) {
    console.error("[WhatsApp Reply] Meta API error:", metaData)
    return
  }

  await admin.from("messages").insert({
    workspace_id: opts.workspaceId,
    thread_id: opts.threadId,
    wa_message_id: metaData.messages?.[0]?.id ?? null,
    content: reply,
    type: "text",
    sender_type: "bot",
    status: "sent",
    metadata: { ai_generated: !isFaq, faq_reply: isFaq },
  })

  await admin.from("threads").update({
    last_message_at: new Date().toISOString(),
    last_message_preview: reply.slice(0, 100),
  }).eq("id", opts.threadId)
}

// ── Native WhatsApp WebRTC Handling ───────────────────────────────────────
async function handleNativeLivekitCall(
  event: WhatsAppInboundCallEvent,
  admin: any
) {
  const lkUrl = process.env.LIVEKIT_URL;
  const lkApiKey = process.env.LIVEKIT_API_KEY;
  const lkApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!lkUrl || !lkApiKey || !lkApiSecret) {
    throw new Error("Missing LiveKit credentials in .env");
  }

  // Find the workspace connection config to get the meta access token
  const { data: channelConn } = await admin
    .from("channel_connections")
    .select("workspace_id, config")
    .eq("type", "whatsapp")
    .filter("config->phoneNumberId", "eq", event.phoneNumberId)
    .maybeSingle();

  const workspaceId = channelConn?.workspace_id || "default";
  const accessToken = channelConn?.config?.accessToken || process.env.META_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error(`No Meta Access Token for phone number ID ${event.phoneNumberId}`);
  }

  const connector = new ConnectorClient(
    normalizeLiveKitHttpUrl(lkUrl),
    lkApiKey,
    lkApiSecret
  );

  const roomName = `wa-${Math.random().toString(36).substring(2, 9)}`;
  
  // Metadata for the voice-worker
  const metadata = JSON.stringify({
    inbound: true,
    phoneNumberId: event.phoneNumberId,
    fromWaId: event.fromWaId,
    callId: event.callId,
  });

  console.log("[WhatsApp LiveKit] Accepting native call", { roomName, from: event.fromWaId });

  await connector.acceptWhatsAppCall({
    whatsappPhoneNumberId: event.phoneNumberId,
    whatsappApiKey: accessToken,
    whatsappCloudApiVersion: "24.0",
    whatsappCallId: event.callId,
    sdp: new SessionDescription({
      type: event.session!.sdpType,
      sdp: event.session!.sdp,
    }),
    roomName: roomName,
    participantName: event.fromWaId,
    agents: [
      new RoomAgentDispatch({
        agentName: "outbound-caller", // target voice-worker/agent.py
        metadata: metadata,
      }),
    ],
  });
}
