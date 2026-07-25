/**
 * Unified Master Scheduler Route (/api/cron/run)
 * Runs natively on Vercel Cron or via external HTTP ping (cron-job.org, UptimeRobot, etc.).
 *
 * Responsibilities:
 *   1. Wake up and resume sleeping workflows where wake_at <= now()
 *   2. Poll Google Sheets for active google_sheet workflows
 *   3. Process legacy lead capture (sync sheets & send pending leads)
 *   4. Execute due scheduled campaigns
 *   5. Send due reminder messages
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { executeWorkflowSynchronously } from "@/lib/workflow/executor";
import { pollActiveSheets, processDueSchedules, sendDueReminders } from "@/services/cron-workers";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  const secretParam = req.nextUrl.searchParams.get("secret") || req.nextUrl.searchParams.get("key") || req.nextUrl.searchParams.get("token");
  if (secretParam === CRON_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const now = new Date().toISOString();
  const results: any = {
    timestamp: now,
    resumedWorkflows: 0,
    sheetPollResult: null,
    legacyLeadCapture: null,
    campaignsResult: null,
    remindersResult: null,
  };

  // 1. Resume sleeping workflows
  try {
    const { data: sleepingRuns, error } = await admin
      .from("workflow_runs")
      .select("*")
      .eq("status", "sleeping")
      .lte("wake_at", now)
      .limit(20);

    if (error) throw error;

    console.log(`[cron/run] Found ${sleepingRuns?.length ?? 0} sleeping workflows to resume`);

    for (const run of sleepingRuns ?? []) {
      if (!run.current_node) {
        await admin.from("workflow_runs").update({ status: "completed", finished_at: now }).eq("id", run.id);
        continue;
      }

      console.log(`[cron/run] Resuming workflow run ${run.id} at node ${run.current_node}`);
      await admin.from("workflow_runs").update({ status: "running" }).eq("id", run.id);

      await executeWorkflowSynchronously({
        runId: run.id,
        workflowId: run.workflow_id,
        workspaceId: run.workspace_id,
        startNodeIds: [run.current_node],
        triggerData: run.context?.trigger_data ?? {},
        admin,
      });

      results.resumedWorkflows++;
    }
  } catch (err: any) {
    console.error("[cron/run] Error resuming workflows:", err.message);
    results.resumedWorkflowsError = err.message;
  }

  // 2. Poll Workflow Builder Google Sheets
  try {
    results.sheetPollResult = await pollActiveSheets(admin);
  } catch (err: any) {
    console.error("[cron/run] Error polling sheets:", err.message);
    results.sheetPollError = err.message;
  }

  // 3. Process Legacy Lead Capture
  try {
    const { syncActiveSheets, sendPendingLeads } = await import("@/services/lead-capture");
    const syncRes = await syncActiveSheets();
    const sendRes = await sendPendingLeads();
    results.legacyLeadCapture = { sync: syncRes, send: sendRes };
  } catch (err: any) {
    console.error("[cron/run] Error processing legacy lead capture:", err.message);
    results.legacyLeadCaptureError = err.message;
  }

  // 4. Process Scheduled Campaigns
  try {
    results.campaignsResult = await processDueSchedules(admin);
  } catch (err: any) {
    console.error("[cron/run] Error processing campaigns:", err.message);
    results.campaignsError = err.message;
  }

  // 5. Process Due Reminders
  try {
    results.remindersResult = await sendDueReminders(admin);
  } catch (err: any) {
    console.error("[cron/run] Error processing reminders:", err.message);
    results.remindersError = err.message;
  }

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
