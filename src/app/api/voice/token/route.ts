import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export async function POST(req: NextRequest) {
  try {
    const { roomName, identity, name } = await req.json();

    if (!roomName || !identity) {
      return NextResponse.json({ error: "Missing roomName or identity" }, { status: 400 });
    }

    const livekitUrl = process.env.LIVEKIT_API_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "LiveKit credentials not configured" }, { status: 500 });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || "Human Agent",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({ token });
  } catch (err: any) {
    console.error("Token generation error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate token" }, { status: 500 });
  }
}
