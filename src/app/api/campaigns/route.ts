import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate } from "@/services/meta";
import { buildWhatsAppTemplateComponents } from "@/lib/whatsapp-variables";
import { SendCampaignPayload } from "@/types";
import { getTenant } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body: SendCampaignPayload = await req.json();
    const { campaign_name, template_name, template_language, contacts, scheduled_at } = body;

    if (!campaign_name || !template_name || !contacts?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createAdminClient();
    const isScheduled = !!scheduled_at;

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        name: campaign_name,
        template_name,
        template_language,
        status: isScheduled ? "scheduled" : "running",
        total_contacts: contacts.length,
        scheduled_at: isScheduled ? new Date(scheduled_at).toISOString() : null,
        contacts_json: isScheduled ? contacts : null,
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      throw new Error(campaignError?.message ?? "Failed to create campaign");
    }

    if (isScheduled) {
      return NextResponse.json({
        success: true,
        campaign_id: campaign.id,
        status: "scheduled",
        scheduled_at: campaign.scheduled_at,
      });
    }

    // Upsert contacts
    const { data: upsertedContacts } = await supabase
      .from("contacts")
      .upsert(
        contacts.map((c) => {
          const { phone, name, email, ...customFields } = c;
          return {
            workspace_id: workspaceId,
            phone: c.phone,
            name: c.name ?? null,
            email: c.email ?? null,
            custom_fields: Object.keys(customFields).length > 0 ? customFields : null
          };
        }),
        { onConflict: "workspace_id, phone", ignoreDuplicates: false }
      )
      .select("id, phone, custom_fields");

    if (!upsertedContacts?.length) {
      throw new Error("Failed to upsert contacts");
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const contact of upsertedContacts) {
      const components = buildWhatsAppTemplateComponents(contact.custom_fields);

      const { ok, wamid, error } = await sendWhatsAppTemplate(
        workspaceId,
        contact.phone,
        template_name,
        template_language,
        components
      );

      await supabase.from("campaign_logs").insert({
        campaign_id: campaign.id,
        contact_id: contact.id,
        wamid: wamid ?? null,
        status: ok ? "sent" : "failed",
        error_message: error ?? null,
        sent_at: new Date().toISOString(),
      });

      await supabase.from("messages").insert({
        contact_id: contact.id,
        campaign_id: campaign.id,
        wamid: wamid ?? null,
        direction: "outbound",
        content: `📢 ${campaign_name} — Template: ${template_name}`,
        status: ok ? "sent" : "failed",
        sent_at: new Date().toISOString(),
      });

      if (ok) {
        sentCount++;
        await supabase
          .from("contacts")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", contact.id);
      } else {
        failedCount++;
        console.error(`Failed to send to ${contact.phone}:`, error);
      }
    }

    await supabase
      .from("campaigns")
      .update({
        status: failedCount === contacts.length ? "failed" : "completed",
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return NextResponse.json({ success: true, campaign_id: campaign.id, sent: sentCount, failed: failedCount });
  } catch (err) {
    console.error("Campaign error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
