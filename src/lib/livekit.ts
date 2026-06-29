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
}

export async function dialSip(opts: DialOptions) {
  const { roomService, sipClient, agentClient, trunkId } = await getLiveKitClients();
  const sipDest = formatSipNumber(opts.toNumber);
  const roomName = `call-${sipDest}-${Date.now()}`;
  const participantIdentity = `sip_${sipDest}`;

  const metadata = JSON.stringify({
    phone_number: opts.toNumber,
    user_id: opts.userId,
    agent_type: opts.agentType,
    voice_id: opts.voiceId || "anushka",
    user_prompt: opts.systemPrompt || "",
    model_provider: opts.agentType === "gemini" ? "gemini" : "groq",
    tts_provider: "sarvam",
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
  const sipCall = await sipClient.createSipParticipant(trunkId, sipDest, roomName, {
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
