import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncActiveSheets } from "@/services/lead-capture";

export async function GET() {
  try {
    const supabase = await createAdminClient();

    // Return ALL settings (multi-workflow support)
    const { data: settingsList, error: settingsError } = await supabase
      .from("lead_capture_settings")
      .select("*")
      .order("created_at", { ascending: true });

    if (settingsError) throw settingsError;

    // Get captured leads history
    const { data: leads, error: leadsError } = await supabase
      .from("lead_capture_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (leadsError) throw leadsError;

    return NextResponse.json({ settings: settingsList ?? [], leads: leads ?? [] });
  } catch (err) {
    console.error("LeadCapture API GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch lead capture data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      sheet_url,
      phone_column,
      name_column,
      email_column,
      template_name,
      template_language,
      delay_minutes,
      is_active,
      whatsapp_enabled,
      email_enabled,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_password,
      email_from_name,
      email_from,
      email_subject,
      email_template_id,
      email_logo_url,
      email_brand_name,
      email_title,
      email_body,
      email_button_text,
      email_button_url,
      email_footer,
      voice_enabled,
      voice_agent_type,
      voice_id,
      voice_prompt,
      voice_agent_id,
      custom_columns
    } = body;

    if (!sheet_url || !phone_column) {
      return NextResponse.json({ error: "Sheet URL and Phone Column are required" }, { status: 400 });
    }

    if (whatsapp_enabled !== false && !template_name) {
      return NextResponse.json({ error: "WhatsApp template is required when WhatsApp sending is active" }, { status: 400 });
    }

    if (email_enabled && (!smtp_host || !smtp_user || !smtp_password || !email_from)) {
      return NextResponse.json({ error: "SMTP Host, User, Password and Sender Email are required when Email sending is active" }, { status: 400 });
    }

    if (voice_enabled && (!voice_prompt || !voice_id) && !voice_agent_id) {
      return NextResponse.json({ error: "Voice Preset (or Prompt and Voice ID) is required when Voice is enabled" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const settingsPayload = {
      name: name || "Untitled Workflow",
      sheet_url,
      phone_column,
      name_column: name_column || null,
      email_column: email_column || null,
      template_name: template_name || "",
      template_language: template_language || "en",
      delay_minutes: Number(delay_minutes) || 0,
      is_active: !!is_active,
      whatsapp_enabled: whatsapp_enabled !== false,
      email_enabled: !!email_enabled,
      smtp_host: smtp_host || null,
      smtp_port: smtp_port ? Number(smtp_port) : 587,
      smtp_user: smtp_user || null,
      smtp_password: smtp_password || null,
      email_from_name: email_from_name || null,
      email_from: email_from || null,
      email_subject: email_subject || null,
      email_template_id: email_template_id || "welcome",
      email_logo_url: email_logo_url || null,
      email_brand_name: email_brand_name || null,
      email_title: email_title || null,
      email_body: email_body || null,
      email_button_text: email_button_text || null,
      email_button_url: email_button_url || null,
      email_footer: email_footer || null,
      voice_enabled: !!voice_enabled,
      voice_agent_type: voice_agent_type || "livekit",
      voice_id: voice_id || "anushka",
      voice_prompt: voice_prompt || null,
      voice_agent_id: voice_agent_id || null,
      custom_columns: custom_columns || [],
      updated_at: new Date().toISOString(),
    };

    let result;

    if (id) {
      // Update existing workflow
      result = await supabase
        .from("lead_capture_settings")
        .update(settingsPayload)
        .eq("id", id)
        .select()
        .single();
    } else {
      // Create new workflow
      const { updated_at, ...insertPayload } = settingsPayload;
      result = await supabase
        .from("lead_capture_settings")
        .insert(insertPayload)
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    // Trigger an immediate sync run asynchronously if it was set to active
    if (result.data?.is_active) {
      syncActiveSheets().catch((err) =>
        console.error("LeadCapture API: Async immediate sync run failed:", err)
      );
    }

    return NextResponse.json({ success: true, settings: result.data });
  } catch (err) {
    console.error("LeadCapture API POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Workflow ID is required" }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
      .from("lead_capture_settings")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("LeadCapture API DELETE Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
