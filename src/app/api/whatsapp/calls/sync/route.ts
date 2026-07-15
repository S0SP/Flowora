import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppSipCredentials } from "@/services/meta";
import { setupWhatsAppSipTrunks } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch credentials from Meta
    const { phoneNumber, sipPassword } = await getWhatsAppSipCredentials();

    // 2. Setup SIP trunks and dispatch rules in LiveKit
    const { outboundTrunkId, inboundTrunkId } = await setupWhatsAppSipTrunks(phoneNumber, sipPassword);

    return NextResponse.json({
      ok: true,
      phoneNumber,
      outboundTrunkId,
      inboundTrunkId,
    });
  } catch (err: any) {
    console.error("Sync WhatsApp Calling Error:", err);
    return NextResponse.json({ error: err.message || "Failed to sync settings" }, { status: 500 });
  }
}
