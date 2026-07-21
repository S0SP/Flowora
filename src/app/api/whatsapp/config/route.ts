import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/whatsapp/encryption";
import { verifyPhoneNumber, registerPhoneNumber, subscribeWabaToApp } from "@/lib/whatsapp/meta-api";

// ──────────────────────────────────────────────────────────────────────────────
// Schema reference (raw_schema.sql):
//
//   channel_connections (
//     id uuid, workspace_id uuid, type, label text, is_active boolean,
//     config jsonb NOT NULL,          ← we store all non-secret config here
//     secrets_enc bytea,              ← raw bytes; we DON'T use this for our
//                                        hex-string token — we embed it in config
//     registered_at timestamp,        ← TOP-LEVEL column (not inside config)
//     subscribed_apps_at timestamp,   ← TOP-LEVEL column
//     last_registration_error text,   ← TOP-LEVEL column
//     created_at, updated_at
//   )
//
// We keep the access token encrypted string inside config.access_token_enc so
// it lives in the jsonb column we can query easily, while secrets_enc (bytea)
// is left null for now (it would need raw bytes, not a hex string).
// ──────────────────────────────────────────────────────────────────────────────

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
      .select("id, config, is_active, registered_at, last_registration_error")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    // No config saved yet
    if (!connection || !connection.config?.access_token_enc) {
      return NextResponse.json({
        reason: "no_config",
        connected: false
      });
    }

    let accessToken = "";
    try {
      accessToken = decrypt(connection.config.access_token_enc);
    } catch (e) {
      return NextResponse.json({
        reason: "token_corrupted",
        connected: false,
        needs_reset: true,
        message: "The stored access token is corrupted or invalid.",
        config: {
          phone_number_id: connection.config.phone_number_id,
          waba_id: connection.config.waba_id,
          verify_token: connection.config.verify_token,
          registered_at: connection.registered_at,
          last_registration_error: connection.last_registration_error
        }
      });
    }

    // Attempt live verify with Meta
    try {
      const phoneInfo = await verifyPhoneNumber({
        accessToken,
        phoneNumberId: connection.config.phone_number_id
      });

      return NextResponse.json({
        connected: true,
        phone_info: phoneInfo,
        config: {
          phone_number_id: connection.config.phone_number_id,
          waba_id: connection.config.waba_id,
          verify_token: connection.config.verify_token,
          registered_at: connection.registered_at,
          last_registration_error: connection.last_registration_error
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
          registered_at: connection.registered_at,
          last_registration_error: connection.last_registration_error
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

    // Check existing row
    const { data: existing } = await admin
      .from("channel_connections")
      .select("id, config, registered_at, last_registration_error")
      .eq("workspace_id", member.workspace_id)
      .eq("type", "whatsapp")
      .limit(1)
      .single();

    // Resolve the decrypted access token
    let decryptedAccessToken = "";
    let newEncryptedToken: string | undefined;

    if (access_token && access_token.trim()) {
      // User provided a new token
      decryptedAccessToken = access_token.trim();
      newEncryptedToken = encrypt(decryptedAccessToken);
    } else if (existing?.config?.access_token_enc) {
      // Reuse existing encrypted token
      try {
        decryptedAccessToken = decrypt(existing.config.access_token_enc);
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

    // Handle registration
    let registeredAt: string | null = existing?.registered_at ?? null;
    let lastRegistrationError: string | null = null;
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

    // Build the config jsonb — access_token_enc lives here
    const configPayload: Record<string, any> = {
      phone_number_id,
      waba_id: waba_id || null,
      verify_token: verify_token || null,
      // Carry forward existing encrypted token unless user gave a new one
      access_token_enc: newEncryptedToken ?? existing?.config?.access_token_enc
    };

    if (existing) {
      const updatePayload: Record<string, any> = {
        config: configPayload,
        is_active: true,
        last_registration_error: lastRegistrationError,
        updated_at: new Date().toISOString()
      };
      if (registeredAt) {
        updatePayload.registered_at = registeredAt;
      }

      const { error } = await admin
        .from("channel_connections")
        .update(updatePayload)
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: `Database update error: ${error.message}` }, { status: 500 });
      }
    } else {
      const { error } = await admin.from("channel_connections").insert({
        workspace_id: member.workspace_id,
        type: "whatsapp",
        label: "WhatsApp",
        config: configPayload,
        is_active: true,
        registered_at: registeredAt,
        last_registration_error: lastRegistrationError
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
      phone_info: verified
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
