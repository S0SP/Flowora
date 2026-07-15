import { RoomServiceClient, SipClient, AgentDispatchClient, EgressClient, EncodedFileOutput, S3Upload } from "livekit-server-sdk";
import { createAdminClient } from "@/lib/supabase/server";

export async function getLiveKitClients() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("chatbot_settings").select("livekit_url, livekit_api_key, livekit_api_secret, livekit_sip_trunk_id").single();
  
  const url = data?.livekit_url || process.env.LIVEKIT_URL!;
  const key = data?.livekit_api_key || process.env.LIVEKIT_API_KEY!;
  const secret = data?.livekit_api_secret || process.env.LIVEKIT_API_SECRET!;
  const trunkId = data?.livekit_sip_trunk_id || process.env.LIVEKIT_SIP_TRUNK_ID!;

  if (!url || !key || !secret) {
    throw new Error("LiveKit API keys are missing in Settings (BYOK)");
  }

  const apiUrl = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

  return {
    roomService: new RoomServiceClient(apiUrl, key, secret),
    sipClient: new SipClient(apiUrl, key, secret),
    agentClient: new AgentDispatchClient(apiUrl, key, secret),
    egressClient: new EgressClient(apiUrl, key, secret),
    trunkId,
  };
}

export function formatSipNumber(toNumber: string): string {
  const digits = toNumber.replace(/[^0-9]/g, "");
  let formatted = digits;
  if (digits.length === 10) formatted = "91" + digits;
  else if (digits.length === 12 && digits.startsWith("91")) formatted = digits;
  else if (digits.length === 11 && digits.startsWith("0")) formatted = "91" + digits.slice(1);
  const techPrefix = process.env.VOICELINK_SIP_TECH_PREFIX || "45454";
  return `${techPrefix}${formatted}`;
}

export interface DialOptions {
  toNumber: string;
  userId: string;
  agentType: "livekit" | "gemini";
  voiceId?: string;
  systemPrompt?: string;
  callId?: string;
  /** Deepgram STT language code (e.g. "hi", "ta", "multi") from the frontend language preset */
  deepgramLanguage?: string;
  /** Sarvam TTS language code (e.g. "hi-IN", "ta-IN") from the frontend language preset */
  sarvamLanguage?: string;
  /** Frontend language preset ID (e.g. "hinglish", "hi", "ta") */
  languagePreset?: string;
  isWhatsApp?: boolean;
}

const META_CIDRS = [
  "31.13.24.0/21",
  "31.13.64.0/18",
  "45.64.40.0/22",
  "57.141.0.0/21",
  "57.141.8.0/22",
  "57.141.12.0/23",
  "57.144.0.0/14",
  "66.220.144.0/20",
  "69.63.176.0/20",
  "69.171.224.0/19",
  "74.119.76.0/22",
  "102.132.96.0/20",
  "103.4.96.0/22",
  "129.134.0.0/16",
  "147.75.208.0/20",
  "157.240.0.0/16",
  "163.70.128.0/17",
  "163.77.128.0/17",
  "173.252.64.0/18",
  "179.60.192.0/22",
  "185.60.216.0/22",
  "185.89.216.0/22",
  "204.15.20.0/22"
];

// Setup inbound and outbound trunks
export async function setupWhatsAppSipTrunks(phoneNumber: string, sipPassword: string) {
  const { sipClient } = await getLiveKitClients();

  const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
  const rawPhone = formattedPhone.replace(/^\+/, "");

  // 1. List existing trunks
  const trunks = await sipClient.listSipTrunk();

  // List existing outbound trunk and delete "whatsapp-outbound" if exists
  const outboundTrunks = trunks.filter(t => t.name === "whatsapp-outbound");
  for (const t of outboundTrunks) {
    console.log("[LiveKit] Deleting existing WhatsApp outbound trunk:", t.sipTrunkId);
    await sipClient.deleteSipTrunk(t.sipTrunkId).catch(err => {
      console.warn("[LiveKit] Failed to delete outbound trunk:", err);
    });
  }

  // Create new outbound trunk
  console.log("[LiveKit] Creating WhatsApp outbound trunk...");
  const outboundTrunk = await sipClient.createSipOutboundTrunk(
    "whatsapp-outbound",
    "wa.meta.vc",
    [formattedPhone],
    {
      transport: 3, // TLS
      authUsername: rawPhone,
      authPassword: sipPassword,
      mediaEncryption: 1, // SIP_MEDIA_ENCRYPT_ALLOW
    }
  );

  // 2. List existing inbound trunk and delete "whatsapp-inbound" if exists
  const inboundTrunks = trunks.filter(t => t.name === "whatsapp-inbound");
  for (const t of inboundTrunks) {
    console.log("[LiveKit] Deleting existing WhatsApp inbound trunk:", t.sipTrunkId);
    await sipClient.deleteSipTrunk(t.sipTrunkId).catch(err => {
      console.warn("[LiveKit] Failed to delete inbound trunk:", err);
    });
  }

  // Create new inbound trunk
  console.log("[LiveKit] Creating WhatsApp inbound trunk...");
  const inboundTrunk = await sipClient.createSipInboundTrunk(
    "whatsapp-inbound",
    [formattedPhone], 
    {
      mediaEncryption: 1, // SIP_MEDIA_ENCRYPT_ALLOW
      allowedNumbers: [".*"],        // Accept calls from any caller
    }
  );
  console.log("[LiveKit] Created inbound trunk:", inboundTrunk.sipTrunkId);

  // 3. List existing dispatch rules and delete "whatsapp-inbound-rule" if exists
  const rules = await sipClient.listSipDispatchRule();
  const existingRule = rules.find(r => r.name === "whatsapp-inbound-rule");
  if (existingRule) {
    console.log("[LiveKit] Deleting existing WhatsApp inbound dispatch rule:", existingRule.sipDispatchRuleId);
    await sipClient.deleteSipDispatchRule(existingRule.sipDispatchRuleId).catch(err => {
      console.warn("[LiveKit] Failed to delete dispatch rule:", err);
    });
  }

  // Create new dispatch rule
  console.log("[LiveKit] Creating WhatsApp inbound dispatch rule...");
  const dispatchRule = await sipClient.createSipDispatchRule(
    {
      type: "individual",
      roomPrefix: "whatsapp-inbound-",
    },
    {
      name: "whatsapp-inbound-rule",
      trunkIds: [inboundTrunk.sipTrunkId],
      metadata: JSON.stringify({
        inbound: true,
        isWhatsApp: true,
      }),
      // @ts-ignore - agentDispatch is present in the API but might be missing in older TS definitions
      agentDispatch: {
        agentName: "outbound-caller",
        metadata: JSON.stringify({ inbound: true, isWhatsApp: true }),
      },
    }
  );

  return {
    outboundTrunkId: outboundTrunk.sipTrunkId,
    inboundTrunkId: inboundTrunk.sipTrunkId,
    dispatchRuleId: dispatchRule.sipDispatchRuleId,
  };
}

export async function dialSip(opts: DialOptions) {
  const { roomService, sipClient, agentClient, trunkId } = await getLiveKitClients();
  
  const digits = opts.toNumber.replace(/[^0-9]/g, "");
  let formatted = digits;
  if (digits.length === 10) formatted = "91" + digits;
  else if (digits.length === 12 && digits.startsWith("91")) formatted = digits;
  else if (digits.length === 11 && digits.startsWith("0")) formatted = "91" + digits.slice(1);

  const sipDest = opts.isWhatsApp 
    ? `+${formatted};transport=tls`
    : formatSipNumber(opts.toNumber);

  const roomName = opts.isWhatsApp
    ? `whatsapp-${formatted}-${Date.now()}`
    : `call-${sipDest}-${Date.now()}`;

  const participantIdentity = opts.isWhatsApp
    ? `sip_whatsapp_${formatted}`
    : `sip_${sipDest}`;

  const metadata = JSON.stringify({
    phone_number: opts.toNumber,
    user_id: opts.userId,
    call_id: opts.callId || null,
    agent_type: opts.agentType,
    voice_id: opts.voiceId || "anushka",
    user_prompt: opts.systemPrompt || "",
    // "gemini" provider = Gemini Live RealtimeModel; anything else = Groq+Sarvam pipeline
    model_provider: opts.agentType === "gemini" ? "gemini" : "groq",
    tts_provider: "sarvam",
    // Language settings from the frontend language preset picker
    deepgram_language: opts.deepgramLanguage || "multi",
    sarvam_language: opts.sarvamLanguage || "hi-IN",
    language_preset: opts.languagePreset || "hinglish",
  });

  // 1. Create room
  await roomService.createRoom({
    name: roomName,
    metadata,
    emptyTimeout: 120,
  });

  // 2. Dispatch AI agent
  const agentName = "outbound-caller";
  await agentClient.createDispatch(roomName, agentName, { metadata });

  // 3. Dial SIP
  let targetTrunkId = trunkId;
  if (opts.isWhatsApp) {
    try {
      const { getWhatsAppSipCredentials } = await import("@/services/meta");
      const { phoneNumber, sipPassword } = await getWhatsAppSipCredentials();
      const { outboundTrunkId } = await setupWhatsAppSipTrunks(phoneNumber, sipPassword);
      targetTrunkId = outboundTrunkId;
    } catch (e) {
      console.error("WhatsApp Calling direct Trunk setup failed, falling back to default trunk:", e);
    }
  } else if (!targetTrunkId) {
    try {
      const trunks = await sipClient.listSipTrunk();
      // Find the first outbound trunk that is not for WhatsApp
      // We must check specifically for TRUNK_OUTBOUND to avoid picking inbound trunks that happen to have outboundNumbers.
      const outboundTrunk = trunks.find((t: any) => {
        if (t.name === "whatsapp-outbound" || t.name === "whatsapp-inbound") return false;
        
        // In the livekit-server-sdk, kind can be an integer (2) or string ("TRUNK_OUTBOUND").
        return t.kind === 2 || String(t.kind) === "TRUNK_OUTBOUND" || String(t.kind) === "2";
      });
      
      if (outboundTrunk) {
        targetTrunkId = outboundTrunk.sipTrunkId;
        console.log(`[LiveKit] Dynamically selected outbound trunk: ${targetTrunkId}`);
      }
    } catch (e) {
      console.warn("[LiveKit] Failed to list SIP trunks for dynamic selection:", e);
    }
  }

  if (!targetTrunkId) {
    throw new Error("Missing SIP trunk ID. Please configure it in settings or ensure an outbound trunk exists in LiveKit.");
  }

  const sipCall = await sipClient.createSipParticipant(targetTrunkId, sipDest, roomName, {
    participantIdentity,
    participantName: "Customer",
  });

  return { roomName, sipCallId: sipCall.sipCallId };
}


export async function startEgressRecording(roomName: string, callRecordId: string) {
  const { egressClient } = await getLiveKitClients();
  try {
    const fileOutput = new EncodedFileOutput({
      filepath: `recordings/${callRecordId}.mp3`,
      output: {
        case: "s3",
        value: new S3Upload({
          accessKey: process.env.SUPABASE_S3_ACCESS_KEY || "",
          secret: process.env.SUPABASE_S3_SECRET || "",
          region: process.env.SUPABASE_S3_REGION || "ap-south-1",
          bucket: process.env.SUPABASE_S3_BUCKET || "call-recordings",
          endpoint: process.env.SUPABASE_S3_ENDPOINT || "",
        }),
      },
    });

    const egress = await egressClient.startRoomCompositeEgress(roomName, {
      file: fileOutput,
    });
    return egress.egressId;
  } catch (e) {
    // Egress is optional — don't fail the call if recording setup fails
    console.warn("Egress recording setup failed:", e);
    return null;
  }
}
