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
      .select("id, workspace_id, nodes, graph, trigger_config, trigger_type")
      .eq("status", "active")
      .eq("trigger_type", "google_sheet");

    console.log(`[poll-sheets] Found ${workflows?.length ?? 0} active google_sheet workflows`)

    let triggered = 0;
    let newLeads = 0;

    for (const workflow of workflows) {
      const triggerConfig = workflow.trigger_config ?? {};
      const lastPolledAt = triggerConfig.last_polled_at;

      // nodes can be top-level OR inside graph column
      const allNodes: any[] = (workflow as any).graph?.nodes ?? (workflow as any).nodes ?? []
      const triggerNode = allNodes.find(
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

      console.log(`[poll-sheets] Polling workflow ${workflow.id} (last polled: ${lastPolledAt ?? 'never'}, interval: ${pollInterval}s)`)

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
        if (!sheetUrl) {
          console.warn(`[poll-sheets] Workflow ${workflow.id}: no sheetUrl in trigger node data:`, JSON.stringify(triggerNode?.data))
          continue;
        }

        // Fetch sheet as CSV (Google Sheets public CSV export)
        const csvUrl = toCSVExportUrl(sheetUrl);
        if (!csvUrl) continue;

        const res = await fetch(csvUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          console.error(`[poll-sheets] Workflow ${workflow.id}: CSV fetch failed: ${res.status} ${res.statusText} url=${csvUrl}`)
          continue;
        }

        const csv = await res.text();
        const rows = parseCSV(csv);
        console.log(`[poll-sheets] Workflow ${workflow.id}: fetched ${rows.length} rows (incl header) from sheet`)
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

          // Mark as processed - use a simple insert with the workflow_id
          // lead_capture_leads requires lead_capture_settings_id (NOT NULL) per schema,
          // but this is workflow-builder polling. We use a sentinel UUID and rely on
          // the processedPhones Set (already loaded above) for deduplication instead.
          // Just track processed in memory for this poll run - the Set was built from DB above.
          // The upsert below uses onConflict on phone+workflow_id (added via migration if needed)
          try {
            await admin.from("lead_capture_leads").insert({
              workspace_id:            workflow.workspace_id,
              workflow_id:             workflow.id,
              lead_capture_settings_id: "00000000-0000-0000-0000-000000000000", // sentinel for workflow-builder
              phone,
              name:  row[nameIdx]?.trim() ?? null,
              email: row[emailIdx]?.trim() ?? null,
              row_hash: phone + "::" + workflow.id,
              status: "pending",
              channel_status: {},
            })
          } catch (dupErr: any) {
            // If insert fails due to duplicate, skip (already processed)
            if (dupErr.code === "23505" || dupErr.message?.includes("duplicate") || dupErr.message?.includes("unique")) {
              console.log(`[poll-sheets] phone=${phone} already in lead_capture_leads, skipping`)
              processedPhones.add(phone)
              continue
            }
            console.warn(`[poll-sheets] Failed to insert lead_capture_lead for ${phone}:`, dupErr.message)
          }

          // Build trigger data from all columns
          const triggerData: Record<string, string> = {};
          headers.forEach((h: string, i: number) => {
            triggerData[h] = row[i]?.trim() ?? "";
          });
          triggerData.phone = phone;
          triggerData.name = triggerData[nameCol ?? "name"] ?? "";
          triggerData.email = triggerData[emailCol ?? "email"] ?? "";

          // Enqueue workflow execution via QStash (fire and forget)
          console.log(`[poll-sheets] Enqueueing workflow ${workflow.id} for phone=${phone} name=${triggerData.name}`)
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
