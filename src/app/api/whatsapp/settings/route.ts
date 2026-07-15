import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  // In a real app, you would fetch these from a database table (e.g., `whatsapp_call_settings`)
  // For now, we mock the settings.
  return NextResponse.json({
    voicemail_enabled: true,
    voicemail_greeting: "Please leave a message after the tone.",
    business_hours_only: false,
    sip_uri: "sip:your-number@your-twilio-sip-domain.sip.twilio.com",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate request...
    if (typeof body.voicemail_enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Usually you'd update settings in your DB using admin client:
    // const admin = await createAdminClient();
    // await admin.from("whatsapp_call_settings").upsert({ ...body });

    return NextResponse.json({ success: true, updated: body });
  } catch (error) {
    console.error("Update Call Settings Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
