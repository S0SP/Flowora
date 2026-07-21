import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber, registerPhoneNumber, subscribeWabaToApp } from "@/lib/whatsapp/meta-api";

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
      .select("id, config, secrets_enc, is_active, last_registration_error")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    if (!connection || !connection.secrets_enc?.access_token) {
      return NextResponse.json({
        reason: "no_config",
        connected: false
      });
    }

    let accessToken = "";
    try {
      accessToken = decrypt(connection.secrets_enc.access_token);
    } catch (e) {
      return NextResponse.json({
        reason: "token_corrupted",
        connected: false,
        needs_reset: true,
        message: "The stored access token is corrupted or invalid."
      });
    }

    try {
      // Verify with Meta API
      await verifyPhoneNumber({
        accessToken,
        phoneNumberId: connection.config.phone_number_id
      });

      return NextResponse.json({
        connected: true,
        config: {
          phone_number_id: connection.config.phone_number_id,
          waba_id: connection.config.waba_id,
          verify_token: connection.config.verify_token,
          registered_at: connection.config.registered_at,
          last_registration_error: connection.config.last_registration_error
        }
      });
    } catch (e: any) {
      return NextResponse.json({
        reason: "meta_api_error",
        connected: false,
        message: e.message || "Failed to verify connection with Meta API",
        config: {
          phone_number_id: connection.config.phone_number_id,
          waba_id: connection.config.waba_id,
          verify_token: connection.config.verify_token,
          registered_at: connection.config.registered_at,
          last_registration_error: connection.config.last_registration_error
        }
      });
    }

  } catch (error: any) {
    console.error("[whatsapp config GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
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

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await req.json();
    const { phone_number_id, waba_id, verify_token, pin, access_token } = payload;

    if (!phone_number_id) {
      return NextResponse.json({ error: "Phone number ID is required" }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Check existing
    const { data: existing } = await admin
      .from("channel_connections")
      .select("id, secrets_enc, config")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    let decryptedAccessToken = "";
    let finalAccessTokenEncrypted = existing?.secrets_enc?.access_token;

    if (access_token) {
      decryptedAccessToken = access_token;
      finalAccessTokenEncrypted = encrypt(access_token);
    } else if (existing?.secrets_enc?.access_token) {
      try {
        decryptedAccessToken = decrypt(existing.secrets_enc.access_token);
      } catch (e) {
        return NextResponse.json({ error: "Cannot reuse corrupted token. Please enter a new one." }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    // Verify token with Meta
    let verified: any = false;
    try {
      verified = await verifyPhoneNumber({
        accessToken: decryptedAccessToken,
        phoneNumberId: phone_number_id
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || "Failed to verify phone number with Meta" }, { status: 400 });
    }

    if (!verified) {
      return NextResponse.json({ error: "Phone number not verified by Meta API" }, { status: 400 });
    }

    let registeredAt = existing?.config?.registered_at;
    let lastRegistrationError = null;
    let registrationSkipped = true;
    let registered = !!registeredAt;

    if (pin && waba_id) {
      registrationSkipped = false;
      try {
        await registerPhoneNumber({
          accessToken: decryptedAccessToken,
          phoneNumberId: phone_number_id,
          pin
        });
        
        await subscribeWabaToApp({
          accessToken: decryptedAccessToken,
          wabaId: waba_id
        });
        
        registeredAt = new Date().toISOString();
        registered = true;
      } catch (e: any) {
        lastRegistrationError = e.message || "Registration failed";
        registered = false;
        registeredAt = null;
      }
    }

    const configPayload = {
      phone_number_id,
      waba_id: waba_id || null,
      verify_token: verify_token || null,
      registered_at: registeredAt,
      last_registration_error: lastRegistrationError
    };

    if (existing) {
      const { error } = await admin.from("channel_connections").update({
        config: configPayload,
        secrets_enc: { access_token: finalAccessTokenEncrypted },
        is_active: true,
        last_registration_error: null
      }).eq("id", existing.id);
      
      if (error) {
        return NextResponse.json({ error: `Database update error: ${error.message}` }, { status: 500 });
      }
    } else {
      const { error } = await admin.from("channel_connections").insert({
        workspace_id: member.workspace_id,
        type: "whatsapp",
        label: "WhatsApp",
        config: configPayload,
        secrets_enc: { access_token: finalAccessTokenEncrypted },
        is_active: true
      });
      
      if (error) {
        return NextResponse.json({ error: `Database insert error: ${error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      registered,
      registration_skipped: registrationSkipped,
      registration_error: lastRegistrationError,
      phone_info: { verified_name: "WhatsApp Account" }
    });
  } catch (error: any) {
    console.error("[whatsapp config POST]", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
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

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = await createAdminClient();

    await admin
      .from("channel_connections")
      .delete()
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[whatsapp config DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
