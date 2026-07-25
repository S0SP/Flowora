/**
 * Campaign Executor Library
 * Executes scheduled campaigns synchronously in memory without QStash queueing.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth";

export async function executeCampaignSynchronously({
  scheduleId,
  workspaceId,
  templateName,
  templateLanguage,
  recipientsFilter,
  admin,
}: {
  scheduleId: string;
  workspaceId: string;
  templateName: string;
  templateLanguage?: string;
  recipientsFilter?: any;
  admin?: any;
}): Promise<{ ok: boolean; sent: number; failed: number; total: number; error?: string }> {
  if (!admin) {
    admin = await createAdminClient();
  }

  try {
    const credentials = await getWhatsAppCredentials(workspaceId, admin);
    const phoneNumId = credentials?.phoneNumberId;
    const token = credentials?.accessToken;

    if (!phoneNumId || !token) {
      await admin
        .from("campaign_schedules")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", scheduleId);
      return { ok: false, sent: 0, failed: 0, total: 0, error: "WhatsApp not configured" };
    }

    let contactQuery = admin
      .from("contacts")
      .select("id, phone, full_name")
      .eq("workspace_id", workspaceId)
      .not("phone", "is", null);

    const filter = recipientsFilter?.filter ?? "all";
    if (filter === "opted_in") {
      contactQuery = contactQuery.eq("whatsapp_opted_in", true);
    } else if (filter === "new_leads") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      contactQuery = contactQuery.gte("created_at", weekAgo);
    }

    const { data: contacts, error } = await contactQuery.limit(10000);
    if (error) throw error;

    let sentCount = 0;
    let failedCount = 0;
    const BATCH_SIZE = 10;
    const DELAY_MS = 200;

    for (let i = 0; i < (contacts ?? []).length; i += BATCH_SIZE) {
      const batch = (contacts ?? []).slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (contact: any) => {
          try {
            const phone = contact.phone?.replace(/\D/g, "");
            if (!phone || phone.length < 10) return;

            const { sendTemplateMessage } = await import("@/lib/whatsapp/meta-api");

            try {
              await sendTemplateMessage({
                phoneNumberId: phoneNumId,
                accessToken: token,
                to: phone,
                templateName: templateName,
                language: templateLanguage ?? "en",
                params: [contact.full_name ?? "there"],
              });
              sentCount++;
            } catch (err: any) {
              failedCount++;
              console.warn(`[campaign-execute] Send failed for ${phone}:`, err.message);
            }
          } catch {
            failedCount++;
          }
        })
      );

      if (i + BATCH_SIZE < (contacts ?? []).length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    await admin
      .from("campaign_schedules")
      .update({
        status: "completed",
        sent_count: sentCount,
        delivered_count: sentCount,
        failed_count: failedCount,
        recipient_count: (contacts ?? []).length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);

    return {
      ok: true,
      sent: sentCount,
      failed: failedCount,
      total: (contacts ?? []).length,
    };
  } catch (err: any) {
    console.error("[jobs/campaign-execute]", err);
    return { ok: false, sent: 0, failed: 0, total: 0, error: err.message };
  }
}

export async function processDueSchedules(admin?: any): Promise<{ processed: number; failed: number; timestamp: string }> {
  if (!admin) {
    admin = await createAdminClient();
  }
  const now = new Date().toISOString();

  try {
    const { data: dueCampaigns, error } = await admin
      .from("campaign_schedules")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(10);

    if (error) throw error;

    const processed: string[] = [];
    const failed: string[] = [];

    for (const campaign of dueCampaigns ?? []) {
      try {
        await admin
          .from("campaign_schedules")
          .update({ status: "running", updated_at: now })
          .eq("id", campaign.id)
          .eq("status", "scheduled");

        const execRes = await executeCampaignSynchronously({
          scheduleId: campaign.id,
          workspaceId: campaign.workspace_id,
          templateName: campaign.template_name,
          templateLanguage: campaign.template_language,
          recipientsFilter: campaign.recipients_filter,
          admin,
        });

        if (execRes.ok) {
          processed.push(campaign.id);
        } else {
          console.error(`[processDueSchedules] Campaign ${campaign.id} failed:`, execRes.error);
          failed.push(campaign.id);
        }
      } catch (err: any) {
        console.error(`[processDueSchedules] Campaign ${campaign.id} error:`, err);
        await admin
          .from("campaign_schedules")
          .update({ status: "failed", updated_at: now })
          .eq("id", campaign.id);
        failed.push(campaign.id);
      }
    }

    return {
      processed: processed.length,
      failed: failed.length,
      timestamp: now,
    };
  } catch (err: any) {
    console.error("[processDueSchedules] Error:", err);
    throw err;
  }
}

