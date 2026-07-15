/**
 * QStash Job: Execute a scheduled campaign.
 * Called by /api/cron/process-schedules after locking the campaign row.
 *
 * Flow:
 *   1. Load contacts matching the recipients filter
 *   2. Fan out WhatsApp template sends (batched to avoid Meta rate limits)
 *   3. Update campaign stats
 *   4. Mark campaign as completed
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for large campaigns

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scheduleId, workspaceId, templateName, templateLanguage, recipientsFilter } = body;

    if (!scheduleId || !workspaceId || !templateName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Get WhatsApp connection for this workspace
    const { data: conn } = await admin
      .from("channel_connections")
      .select("config")
      .eq("workspace_id", workspaceId)
      .eq("type", "whatsapp")
      .single();

    const phoneNumId = (conn?.config as any)?.phoneNumberId ?? process.env.META_PHONE_NUMBER_ID;
    const token = (conn?.config as any)?.accessToken ?? process.env.META_ACCESS_TOKEN;

    if (!phoneNumId || !token) {
      await admin
        .from("campaign_schedules")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", scheduleId);
      return NextResponse.json({ error: "WhatsApp not configured" }, { status: 500 });
    }

    // Load contacts based on filter
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
    const BATCH_SIZE = 10; // Meta allows ~80 messages/sec per phone number
    const DELAY_MS = 200; // 200ms between batches = ~50 msg/sec

    // Send in batches
    for (let i = 0; i < (contacts ?? []).length; i += BATCH_SIZE) {
      const batch = (contacts ?? []).slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (contact: any) => {
          try {
            const phone = contact.phone?.replace(/\D/g, "");
            if (!phone || phone.length < 10) return;

            const res = await fetch(
              `https://graph.facebook.com/v18.0/${phoneNumId}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  recipient_type: "individual",
                  to: phone,
                  type: "template",
                  template: {
                    name: templateName,
                    language: { code: templateLanguage ?? "en" },
                    components: [
                      {
                        type: "body",
                        parameters: [
                          {
                            type: "text",
                            text: contact.full_name ?? "there",
                          },
                        ],
                      },
                    ],
                  },
                }),
              }
            );

            if (res.ok) {
              sentCount++;
            } else {
              failedCount++;
              const errData = await res.json().catch(() => ({}));
              console.warn(`[campaign-execute] Send failed for ${phone}:`, errData?.error?.message);
            }
          } catch {
            failedCount++;
          }
        })
      );

      // Rate limit delay
      if (i + BATCH_SIZE < (contacts ?? []).length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    // Update campaign stats
    await admin
      .from("campaign_schedules")
      .update({
        status: "completed",
        sent_count: sentCount,
        delivered_count: sentCount, // Will be updated via webhook
        failed_count: failedCount,
        recipient_count: (contacts ?? []).length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      failed: failedCount,
      total: (contacts ?? []).length,
    });
  } catch (err: any) {
    console.error("[jobs/campaign-execute]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
