/**
 * Workflow Trigger Helper Library
 * Initiates synchronous workflow runs in memory without QStash queueing.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { buildEdgeMap, resolveNextNodes, executeWorkflowSynchronously } from "@/lib/workflow/executor";

export async function runWorkflowTrigger({
  workflowId,
  workspaceId,
  triggerData,
  admin,
}: {
  workflowId: string;
  workspaceId?: string;
  triggerData: any;
  admin?: any;
}): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (!admin) {
    admin = await createAdminClient();
  }

  let query = admin.from("workflows").select("*").eq("id", workflowId);
  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }
  const { data: workflow, error } = await query.single();

  if (error || !workflow) {
    console.error(`[runWorkflowTrigger] Workflow ${workflowId} not found. Error:`, error?.message);
    return { ok: false, error: "Workflow not found" };
  }

  if (workflow.status !== "active") {
    console.warn(`[runWorkflowTrigger] Workflow ${workflowId} is not active (status=${workflow.status})`);
    return { ok: false, error: "Workflow is not active" };
  }

  if (!workspaceId) {
    workspaceId = workflow.workspace_id;
  }

  const actualNodes = workflow.graph?.nodes ?? workflow.nodes ?? [];
  const actualEdges = workflow.graph?.edges ?? workflow.edges ?? [];
  console.log(`[runWorkflowTrigger] workflowId=${workflowId} nodes=${actualNodes.length} edges=${actualEdges.length}`);

  const { data: run } = await admin
    .from("workflow_runs")
    .insert({
      workspace_id:  workspaceId,
      workflow_id:   workflowId,
      status:        "running",
      started_at:    new Date().toISOString(),
      context: {
        trigger_type:  workflow.trigger_type,
        trigger_data:  triggerData ?? {},
        steps_total:   actualNodes.length,
        steps_log:     [],
      }
    })
    .select()
    .single();

  if (!run) {
    console.error(`[runWorkflowTrigger] Failed to create run record for workflow ${workflowId}`);
    return { ok: false, error: "Failed to create run record" };
  }

  console.log(`[runWorkflowTrigger] Created run ${run.id} for workflow ${workflowId}`);

  try {
    const triggerNode = actualNodes.find((n: any) =>
      n.type === "trigger" ||
      n.data?.type === "trigger" ||
      n.data?.subtype === "google_sheet" ||
      n.data?.subtype === "webhook" ||
      n.data?.subtype === "form"
    );

    if (!triggerNode) {
      throw new Error(`No trigger node found in workflow.`);
    }

    const edgeMap = buildEdgeMap(actualEdges);
    const nextNodeIds = resolveNextNodes(
      triggerNode.id,
      triggerNode.data?.subtype ?? triggerNode.data?.type ?? triggerNode.type,
      triggerNode.data,
      null,
      edgeMap,
      new Set([triggerNode.id])
    );

    console.log(`[runWorkflowTrigger] Executing next nodes synchronously: ${nextNodeIds.join(", ")}`);

    await admin.from("workflow_runs").update({
      context: {
        ...run.context,
        steps_completed: 1,
      }
    }).eq("id", run.id);

    const execResult = await executeWorkflowSynchronously({
      runId: run.id,
      workflowId,
      workspaceId: workspaceId!,
      startNodeIds: nextNodeIds,
      triggerData: triggerData ?? {},
      visitedNodeIds: [triggerNode.id],
      admin,
    });

    if (!execResult.ok) {
      return { ok: false, runId: run.id, error: execResult.error };
    }

    return { ok: true, runId: run.id };
  } catch (execErr: any) {
    await admin.from("workflow_runs").update({
      status:        "failed",
      finished_at:   new Date().toISOString(),
      context: {
        ...run.context,
        error_message: execErr.message ?? "Failed during workflow execution",
      }
    }).eq("id", run.id);
    return { ok: false, runId: run.id, error: execErr.message };
  }
}

export async function pollActiveSheets(admin?: any): Promise<{ checked: number; triggered: number; newLeads: number }> {
  if (!admin) {
    admin = await createAdminClient();
  }

  const { data: workflows } = await admin
    .from("workflows")
    .select("id, workspace_id, nodes, graph, trigger_config, trigger_type")
    .eq("status", "active")
    .eq("trigger_type", "google_sheet");

  console.log(`[pollActiveSheets] Found ${(workflows ?? []).length} active google_sheet workflows`);

  let triggered = 0;
  let newLeads = 0;

  for (const workflow of workflows ?? []) {
    const triggerConfig = workflow.trigger_config ?? {};
    const lastPolledAt = triggerConfig.last_polled_at;

    const allNodes: any[] = (workflow as any).graph?.nodes ?? (workflow as any).nodes ?? [];
    const triggerNode = allNodes.find(
      (n: any) => n.data?.type === "trigger" || n.data?.subtype === "google_sheet" || n.type === "trigger"
    );

    const pollInterval = Number(triggerNode?.data?.pollInterval || 60);

    if (lastPolledAt) {
      const elapsedMs = Date.now() - new Date(lastPolledAt).getTime();
      if (elapsedMs < pollInterval * 1000) {
        continue;
      }
    }

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
      console.warn(`[pollActiveSheets] Failed to update last_polled_at for workflow ${workflow.id}:`, err.message);
    }

    try {
      const sheetUrl = triggerNode?.data?.sheetUrl || triggerNode?.data?.url;
      if (!sheetUrl) continue;

      const csvUrl = toCSVExportUrl(sheetUrl);
      if (!csvUrl) continue;

      const res = await fetch(csvUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;

      const csv = await res.text();
      const rows = parseCSV(csv);
      if (rows.length < 2) continue;

      const headers = rows[0].map((h: string) => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      const phoneCol = triggerNode?.data?.phoneColumn?.toLowerCase() ?? findColumn(headers, ["phone", "mobile", "whatsapp", "number"]);
      const nameCol = triggerNode?.data?.nameColumn?.toLowerCase() ?? findColumn(headers, ["name", "full_name", "fullname"]);
      const emailCol = triggerNode?.data?.emailColumn?.toLowerCase() ?? findColumn(headers, ["email", "email_address"]);

      const phoneIdx = headers.indexOf(phoneCol ?? "phone");
      const nameIdx = headers.indexOf(nameCol ?? "name");
      const emailIdx = headers.indexOf(emailCol ?? "email");

      const { data: processed } = await admin
        .from("lead_capture_leads")
        .select("phone")
        .eq("workflow_id", workflow.id)
        .eq("workspace_id", workflow.workspace_id);

      let { data: dummySettings } = await admin
        .from("lead_capture_settings")
        .select("id")
        .eq("workspace_id", workflow.workspace_id)
        .eq("name", "Workflow Builder Dummy")
        .maybeSingle();

      if (!dummySettings) {
        const { data: newSettings } = await admin.from("lead_capture_settings").insert({
          workspace_id: workflow.workspace_id,
          name: "Workflow Builder Dummy",
          is_active: false,
          sheet_url: "dummy",
          phone_column: "phone",
          delay_minutes: 0,
        }).select("id").single();
        dummySettings = newSettings;
      }

      const processedPhones = new Set((processed ?? []).map((r: any) => normalizePhone(r.phone)));

      for (const row of dataRows) {
        const rawPhone = row[phoneIdx]?.trim();
        if (!rawPhone) continue;

        const phone = normalizePhone(rawPhone);
        if (processedPhones.has(phone)) continue;

        try {
          await admin.from("lead_capture_leads").insert({
            workspace_id: workflow.workspace_id,
            workflow_id: workflow.id,
            lead_capture_settings_id: dummySettings?.id ?? null,
            phone,
            name: row[nameIdx]?.trim() ?? null,
            email: row[emailIdx]?.trim() ?? null,
            row_hash: phone + "::" + workflow.id,
            status: "pending",
            channel_status: {},
          });
        } catch (dupErr: any) {
          if (dupErr.code === "23505" || dupErr.message?.includes("duplicate") || dupErr.message?.includes("unique")) {
            processedPhones.add(phone);
            continue;
          }
        }

        const triggerData: Record<string, string> = {};
        headers.forEach((h: string, i: number) => {
          triggerData[h] = row[i]?.trim() ?? "";
        });
        triggerData.phone = phone;
        triggerData.name = triggerData[nameCol ?? "name"] ?? "";
        triggerData.email = triggerData[emailCol ?? "email"] ?? "";

        await runWorkflowTrigger({
          workflowId: workflow.id,
          workspaceId: workflow.workspace_id,
          triggerData,
          admin,
        });

        processedPhones.add(phone);
        newLeads++;
      }

      triggered++;
    } catch (err: any) {
      console.error(`[pollActiveSheets] Workflow ${workflow.id} error:`, err.message);
    }
  }

  return { checked: (workflows ?? []).length, triggered, newLeads };
}

function toCSVExportUrl(sheetUrl: string): string | null {
  try {
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return null;
    const sheetId = match[1];
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

