/**
 * Vercel Cron: runs every minute.
 * Picks up campaign_schedules with status='scheduled' AND scheduled_at <= now()
 * and fires them via Meta WhatsApp API.
 *
 * On Vercel free/hobby tier, crons run every minute max.
 * On Pro+ tier you can use shorter intervals.
 *
 * For drip campaigns with multi-day delays we use QStash (see /api/jobs/workflow-step).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueue } from "@/lib/qstash";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel cron auth
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  // Verify this is coming from Vercel Cron or our own secret
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const now = new Date().toISOString();

  try {
    // Find campaigns due to run
    const { data: dueCampaigns, error } = await admin
      .from("campaign_schedules")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .limit(10); // Process max 10 per cron run to avoid timeout

    if (error) throw error;

    const processed: string[] = [];
    const failed: string[] = [];

    for (const campaign of dueCampaigns ?? []) {
      try {
        // Mark as running immediately to prevent double-processing
        await admin
          .from("campaign_schedules")
          .update({ status: "running", updated_at: now })
          .eq("id", campaign.id)
          .eq("status", "scheduled"); // Double-check status (optimistic lock)

        // Fan out via QStash for large sends (non-blocking)
        await enqueue("/api/jobs/campaign-execute", {
          scheduleId: campaign.id,
          workspaceId: campaign.workspace_id,
          templateName: campaign.template_name,
          templateLanguage: campaign.template_language,
          recipientsFilter: campaign.recipients_filter,
        }, { retries: 2 });

        processed.push(campaign.id);
      } catch (err: any) {
        console.error(`[cron/process-schedules] Campaign ${campaign.id} failed:`, err);

        await admin
          .from("campaign_schedules")
          .update({ status: "failed", updated_at: now })
          .eq("id", campaign.id);

        failed.push(campaign.id);
      }
    }

    return NextResponse.json({
      processed: processed.length,
      failed: failed.length,
      timestamp: now,
    });
  } catch (err: any) {
    console.error("[cron/process-schedules] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
