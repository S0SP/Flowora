import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, phone, workspaceId } = body;

    if (!roomName || !phone) {
      return NextResponse.json({ error: "Missing roomName or phone" }, { status: 400 });
    }

    const admin = await createAdminClient();

    const status = await admin.channel('dashboard:ringing').send({
      type: 'broadcast',
      event: 'incoming_transfer',
      payload: { roomName, phone, workspaceId },
    });
 
    if (status === "error") {
      console.error("Broadcast failed");
      return NextResponse.json({ error: "Failed to broadcast ringing event" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Transfer error:", err);
    return NextResponse.json({ error: err.message || "Failed to initiate transfer" }, { status: 500 });
  }
}
