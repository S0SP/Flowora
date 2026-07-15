import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName } = body;

    if (!roomName) {
      return NextResponse.json({ error: "Missing roomName" }, { status: 400 });
    }

    const livekitUrl = process.env.LIVEKIT_API_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "LiveKit credentials not configured" }, { status: 500 });
    }

    const roomService = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

    // Get all participants in the room
    const participants = await roomService.listParticipants(roomName);
    
    // Find any participant that represents the AI agent
    // Typically agents have identities starting with 'agent-' or similar
    const agentParticipants = participants.filter(p => 
      p.identity.toLowerCase().includes('agent') || 
      p.name.toLowerCase().includes('agent')
    );

    for (const agent of agentParticipants) {
      await roomService.removeParticipant(roomName, agent.identity);
    }

    return NextResponse.json({ ok: true, removedCount: agentParticipants.length });
  } catch (err: any) {
    console.error("Kick agent error:", err);
    return NextResponse.json({ error: err.message || "Failed to kick agent" }, { status: 500 });
  }
}
