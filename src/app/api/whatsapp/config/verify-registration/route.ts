import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber, getSubscribedApps } from "@/lib/whatsapp/meta-api";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!member) return NextResponse.json({ error: "No workspace" }, { status: 403 });

    const admin = await createAdminClient();

    const { data: connection } = await admin
      .from("channel_connections")
      .select("id, config")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    if (!connection || !connection.config?.access_token_enc) {
      return NextResponse.json({ error: "No WhatsApp configuration found." }, { status: 400 });
    }

    let accessToken = "";
    try {
      accessToken = decrypt(connection.config.access_token_enc);
    } catch (e) {
      return NextResponse.json({ error: "Stored token is corrupted or invalid." }, { status: 400 });
    }

    const { phone_number_id, waba_id } = connection.config;

    let phoneVerified: any = false;
    let subscribedApps: any[] = [];
    
    // 1. Verify Phone Number Access
    try {
      phoneVerified = await verifyPhoneNumber({
        accessToken,
        phoneNumberId: phone_number_id
      });
    } catch (e: any) {
      return NextResponse.json({ 
        error: `Failed to verify phone number ID: ${e.message}` 
      }, { status: 400 });
    }

    // 2. Fetch Subscribed Apps (if WABA ID is provided)
    if (waba_id) {
      try {
        subscribedApps = await getSubscribedApps({
          accessToken,
          wabaId: waba_id
        });
      } catch (e: any) {
         return NextResponse.json({ 
          error: `Failed to fetch subscribed apps for WABA: ${e.message}` 
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      phone_verified: phoneVerified,
      subscribed_apps: subscribedApps,
      message: "Meta APIs verified successfully."
    });

  } catch (error: any) {
    console.error("[whatsapp config verify-registration GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
