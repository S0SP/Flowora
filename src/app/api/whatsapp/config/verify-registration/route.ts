import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber, getSubscribedApps } from "@/lib/whatsapp/meta-api";
import { createAdminClient as _unused } from "@/lib/supabase/server"; // eslint-disable-line

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
      .select("id, config, registered_at, last_registration_error")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    if (!connection || !connection.config?.access_token_enc) {
      return NextResponse.json({
        live: false,
        checks: { credentials_stored: false, phone_verified: null, apps_subscribed: null },
        errors: ["No WhatsApp configuration found. Please save credentials first."]
      });
    }

    let accessToken = "";
    try {
      accessToken = decrypt(connection.config.access_token_enc);
    } catch (e) {
      return NextResponse.json({
        live: false,
        checks: { credentials_stored: false, phone_verified: null, apps_subscribed: null },
        errors: ["Stored token is corrupted. Please reset and re-enter credentials."]
      });
    }

    const { phone_number_id, waba_id } = connection.config;

    // Run checks and accumulate results
    const checks: Record<string, boolean | null> = {
      credentials_stored: true,
      phone_verified: null,
      apps_subscribed: null,
    };
    const errors: string[] = [];

    // 1. Verify Phone Number
    let phoneVerified: any = null;
    try {
      phoneVerified = await verifyPhoneNumber({ accessToken, phoneNumberId: phone_number_id });
      checks.phone_verified = true;
    } catch (e: any) {
      checks.phone_verified = false;
      errors.push(`Phone number verification failed: ${e.message}`);
    }

    // 2. Check subscribed apps (if WABA ID is present)
    if (waba_id) {
      try {
        const apps = await getSubscribedApps({ accessToken, wabaId: waba_id });
        checks.apps_subscribed = Array.isArray(apps) && apps.length > 0;
        if (!checks.apps_subscribed) {
          errors.push("No apps subscribed to this WABA. Run 'Save Configuration' with the PIN to subscribe.");
        }
      } catch (e: any) {
        checks.apps_subscribed = false;
        errors.push(`App subscription check failed: ${e.message}`);
      }
    }

    const live = checks.phone_verified === true && (waba_id ? checks.apps_subscribed === true : true);

    return NextResponse.json({
      live,
      checks,
      errors,
      phone_info: phoneVerified,
      registered_at: connection.registered_at,
      last_registration_error: connection.last_registration_error,
    });

  } catch (error: any) {
    console.error("[whatsapp config verify-registration GET]", error);
    return NextResponse.json({
      live: false,
      checks: {},
      errors: ["Internal server error: " + (error.message || "Unknown error")],
    });
  }
}
