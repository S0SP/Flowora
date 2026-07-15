/**
 * Vercel Cron: runs every minute.
 * Polls Google Sheets for active workflows with google_sheet trigger.
 * New rows trigger workflow execution via QStash (non-blocking).
 *
 * Architecture (serverless-safe):
 *   Cron → check for new rows → enqueue per-lead job to QStash
 *   QStash → /api/jobs/workflow-step → execute nodes
 *   Delays in workflow → re-enqueue with QStash delay param
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueue } from "@/lib/qstash";

export const runtime = "nodejs";
export const maxDuration = 55;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();

  try {
    // Find active workflows with google_sheet trigger
    const { data: workflows } = await admin
      .from("workflows")
      .select("id, workspace_id, nodes, trigger_config, trigger_type")
      .eq("status", "active")
      .eq("trigger_type", "google_sheet");

    if (!workflows?.length) {
      return NextResponse.json({ checked: 0 });
    }

    let triggered = 0;
    let newLeads = 0;

    for (const workflow of workflows) {
      const triggerConfig = workflow.trigger_config ?? {};
      const lastPolledAt = triggerConfig.last_polled_at;

      const triggerNode = workflow.nodes?.find(
        (n: any) => n.data?.type === "trigger" || n.data?.subtype === "google_sheet" || n.type === "trigger"
      );

      const pollInterval = Number(triggerNode?.data?.pollInterval || 60);

      if (lastPolledAt) {
        const elapsedMs = Date.now() - new Date(lastPolledAt).getTime();
        if (elapsedMs < pollInterval * 1000) {
          console.log(`[poll-sheets] Skipping workflow ${workflow.id}: interval is ${pollInterval}s, only ${(elapsedMs / 1000).toFixed(0)}s elapsed`);
          continue;
        }
      }

      // Record check timestamp
      try {
        const updatedConfig = {
          ...triggerConfig,
          last_polled_at: new Date().toISOString()
        };
        await admin
          .from("workflows")
          .update({ trigger_config: updatedConfig })
          .eq("id", workflow.id);
      } catch (err: any) {
        console.warn(`[poll-sheets] Failed to update last_polled_at for workflow ${workflow.id}:`, err.message);
      }

      try {
        const sheetUrl = triggerNode?.data?.sheetUrl || triggerNode?.data?.url;
        if (!sheetUrl) continue;

        // Fetch sheet as CSV (Google Sheets public CSV export)
        const csvUrl = toCSVExportUrl(sheetUrl);
        if (!csvUrl) continue;

        const res = await fetch(csvUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;

        const csv = await res.text();
        const rows = parseCSV(csv);
        if (rows.length < 2) continue;

        const headers = rows[0].map((h: string) => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Map columns
        const phoneCol = triggerNode?.data?.phoneColumn?.toLowerCase() ?? findColumn(headers, ["phone", "mobile", "whatsapp", "number"]);
        const nameCol = triggerNode?.data?.nameColumn?.toLowerCase() ?? findColumn(headers, ["name", "full_name", "fullname"]);
        const emailCol = triggerNode?.data?.emailColumn?.toLowerCase() ?? findColumn(headers, ["email", "email_address"]);

        const phoneIdx = headers.indexOf(phoneCol ?? "phone");
        const nameIdx = headers.indexOf(nameCol ?? "name");
        const emailIdx = headers.indexOf(emailCol ?? "email");

        // Get already-processed phones for this workflow
        const { data: processed } = await admin
          .from("lead_capture_leads")
          .select("phone")
          .eq("workflow_id", workflow.id)
          .eq("workspace_id", workflow.workspace_id);

        const processedPhones = new Set((processed ?? []).map((r: any) => normalizePhone(r.phone)));

        // Process new rows
        for (const row of dataRows) {
          const rawPhone = row[phoneIdx]?.trim();
          if (!rawPhone) continue;

          const phone = normalizePhone(rawPhone);
          if (processedPhones.has(phone)) continue;

          // Mark as being processed (prevent duplicate triggers)
          await admin.from("lead_capture_leads").upsert({
            workspace_id: workflow.workspace_id,
            workflow_id: workflow.id,
            phone,
            name: row[nameIdx]?.trim() ?? null,
            email: row[emailIdx]?.trim() ?? null,
            status: "pending",
            channel_status: {},
          }, {
            onConflict: "phone,workflow_id",
            ignoreDuplicates: true,
          });

          // Build trigger data from all columns
          const triggerData: Record<string, string> = {};
          headers.forEach((h: string, i: number) => {
            triggerData[h] = row[i]?.trim() ?? "";
          });
          triggerData.phone = phone;
          triggerData.name = triggerData[nameCol ?? "name"] ?? "";
          triggerData.email = triggerData[emailCol ?? "email"] ?? "";

          // Enqueue workflow execution via QStash (fire and forget)
          await enqueue("/api/workflows/trigger", {
            workflowId: workflow.id,
            workspaceId: workflow.workspace_id,
            triggerData,
          }, { retries: 2 });

          processedPhones.add(phone);
          newLeads++;
        }

        triggered++;
      } catch (err: any) {
        console.error(`[poll-sheets] Workflow ${workflow.id} error:`, err.message);
      }
    }

    return NextResponse.json({ checked: workflows.length, triggered, newLeads });
  } catch (err: any) {
    console.error("[cron/poll-sheets] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCSVExportUrl(sheetUrl: string): string | null {
  try {
    // Handle: https://docs.google.com/spreadsheets/d/SHEET_ID/...
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    const sheetId = match[1];
    // Extract gid (tab ID) if present
    const gidMatch = sheetUrl.match(/gid=(\d+)/);
    const gid = gidMatch?.[1] ?? "0";
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

function parseCSV(text: string): string[][] {
  const lines = text.split("\n").filter(l => l.trim());
  return lines.map(line => {
    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current); current = ""; continue; }
      current += ch;
    }
    cols.push(current);
    return cols;
  });
}

function findColumn(headers: string[], candidates: string[]): string | undefined {
  for (const c of candidates) {
    const found = headers.find(h => h.includes(c));
    if (found) return found;
  }
  return undefined;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^91/, "");
}
