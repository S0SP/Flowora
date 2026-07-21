import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate } from "./meta";
import { Campaign, ParsedContact } from "@/types";
import { syncActiveSheets, sendPendingLeads } from "./lead-capture";



export async function processScheduledCampaigns() {
  // Run Lead Capture sheet sync and queue processing on each tick
  try {
    await syncActiveSheets();
    await sendPendingLeads();
  } catch (err) {
    console.error("Scheduler: Lead Capture execution error:", err);
  }

  let processedCount = 0;

  try {
    const supabase = await createAdminClient();

    // Query campaigns that are scheduled and whose scheduled_at time has passed
    const { data: campaigns, error: queryError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (queryError) {
      console.error("Scheduler: failed to fetch scheduled campaigns:", queryError);
      return { success: false, error: queryError.message };
    }

    if (!campaigns || campaigns.length === 0) {
      return { success: true, processed: 0 };
    }

    console.log(`Scheduler: found ${campaigns.length} scheduled campaign(s) to process.`);

    for (const campaign of campaigns) {
      // Concurrency check: Atomic state transition from 'scheduled' -> 'running'
      const { data: lockedCampaign, error: lockError } = await supabase
        .from("campaigns")
        .update({ status: "running" })
        .eq("id", campaign.id)
        .eq("status", "scheduled")
        .select();

      if (lockError || !lockedCampaign || lockedCampaign.length === 0) {
        console.log(`Scheduler: campaign ${campaign.id} is already being processed by another worker. Skipping.`);
        continue;
      }

      console.log(`Scheduler: processing campaign "${campaign.name}" (${campaign.id})`);

      try {
        const contacts = (campaign.contacts_json as ParsedContact[]) || [];

        if (contacts.length === 0) {
          await supabase
            .from("campaigns")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              error_message: "No contacts found in campaign configuration"
            })
            .eq("id", campaign.id);
          processedCount++;
          continue;
        }

        // 1. Upsert contacts
        const { data: upsertedContacts, error: upsertError } = await supabase
          .from("contacts")
          .upsert(
            contacts.map((c) => ({ phone: c.phone, name: c.name ?? null, email: c.email ?? null })),
            { onConflict: "phone", ignoreDuplicates: false }
          )
          .select("id, phone");

        if (upsertError || !upsertedContacts || upsertedContacts.length === 0) {
          throw new Error(upsertError?.message ?? "Failed to upsert campaign contacts");
        }

        let sentCount = 0;
        let failedCount = 0;

        // 2. Loop and send messages
        for (const contact of upsertedContacts) {
          const { ok, wamid, error } = await sendWhatsAppTemplate(
            campaign.workspace_id,
            contact.phone,
            campaign.template_name,
            campaign.template_language
          );

          // Log in campaign logs
          await supabase.from("campaign_logs").insert({
            campaign_id: campaign.id,
            contact_id: contact.id,
            wamid: wamid ?? null,
            status: ok ? "sent" : "failed",
            error_message: error ?? null,
            sent_at: new Date().toISOString(),
          });

          // Log in general messages
          await supabase.from("messages").insert({
            contact_id: contact.id,
            campaign_id: campaign.id,
            wamid: wamid ?? null,
            direction: "outbound",
            content: `📢 ${campaign.name} — Template: ${campaign.template_name}`,
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
            console.error(`Scheduler: failed to send template to ${contact.phone}:`, error);
          }
        }

        // 3. Complete campaign status
        await supabase
          .from("campaigns")
          .update({
            status: failedCount === contacts.length ? "failed" : "completed",
            sent_count: sentCount,
            failed_count: failedCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);

        console.log(`Scheduler: campaign "${campaign.name}" processed. Sent: ${sentCount}, Failed: ${failedCount}`);
        processedCount++;
      } catch (campaignErr) {
        console.error(`Scheduler: error processing campaign ${campaign.id}:`, campaignErr);
        await supabase
          .from("campaigns")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", campaign.id);
      }
    }

    return { success: true, processed: processedCount };
  } catch (err) {
    console.error("Scheduler: unexpected error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
