/**
 * Core Workflow Engine: Synchronous In-Process Execution Library.
 * Handles condition branching, delay scheduling, and all node types in-memory.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth";

export async function executeWorkflowSynchronously({
  runId,
  workflowId,
  workspaceId,
  startNodeIds,
  triggerData,
  visitedNodeIds = [],
  admin,
}: {
  runId: string;
  workflowId: string;
  workspaceId: string;
  startNodeIds: string[];
  triggerData: any;
  visitedNodeIds?: string[];
  admin?: any;
}): Promise<{ ok: boolean; executedNodes: string[]; sleepingAt?: string; error?: string }> {
  if (!admin) {
    admin = await createAdminClient();
  }

  const { data: workflow } = await admin
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();

  if (!workflow || workflow.status !== "active") {
    return { ok: false, executedNodes: [], error: "Workflow inactive or not found" };
  }

  const nodes: any[] = (workflow as any).graph?.nodes ?? (workflow as any).nodes ?? [];
  const edges: any[] = (workflow as any).graph?.edges ?? (workflow as any).edges ?? [];

  console.log(`[executeWorkflowSynchronously] workflowId=${workflowId} runId=${runId} startNodes=${startNodeIds.join(",")} totalNodes=${nodes.length}`);

  const edgeMap = buildEdgeMap(edges);
  const workQueue: string[] = [...startNodeIds];
  const visited = new Set<string>(visitedNodeIds);
  const executedNodes: string[] = [];

  while (workQueue.length > 0) {
    const nodeId = workQueue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const currentNode = nodes.find(n => n.id === nodeId);
    if (!currentNode) {
      console.warn(`[executeWorkflowSynchronously] Node ${nodeId} not found in workflow ${workflowId}`);
      continue;
    }

    const nodeData = currentNode.data ?? {};
    const nodeType = nodeData.subtype ?? nodeData.type ?? currentNode.type ?? "";

    // ── Check if this is a delay node ──────────────────────────────────────
    if (nodeType === "delay") {
      const d = currentNode.data ?? {};
      const totalSec =
        (d.delayDays    ?? 0) * 86400 +
        (d.delayHours   ?? 0) * 3600  +
        (d.delayMinutes ?? 0) * 60;

      if (totalSec > 0) {
        const wakeAt = new Date(Date.now() + totalSec * 1000).toISOString();
        const afterDelayIds = getNextFromEdgeMap(nodeId, edgeMap, visited);
        const nextNodeToResume = afterDelayIds[0] ?? null;

        console.log(`[executeWorkflowSynchronously] Delay node ${nodeId} reached. Sleeping until ${wakeAt}. Next node: ${nextNodeToResume}`);

        await admin.from("workflow_runs").update({
          status: "sleeping",
          wake_at: wakeAt,
          current_node: nextNodeToResume,
        }).eq("id", runId);

        return { ok: true, executedNodes, sleepingAt: wakeAt };
      }
    }

    // ── Evaluate condition or execute standard node ────────────────────────
    let condResult: boolean | null = null;
    let execResult: any = {};

    if (nodeType === "condition") {
      condResult = evaluateCondition(nodeData, { triggerData });
      execResult = { condition: condResult };
      console.log(`[executeWorkflowSynchronously] Condition node ${nodeId}: result=${condResult}`);
    } else {
      try {
        console.log(`[executeWorkflowSynchronously] Executing node ${nodeId} type=${nodeType}`);
        execResult = await executeNode(currentNode, triggerData, workspaceId, admin);
        console.log(`[executeWorkflowSynchronously] Node ${nodeId} result:`, JSON.stringify(execResult));
      } catch (err: any) {
        console.error(`[executeWorkflowSynchronously] Node ${nodeId} error:`, err.message);
        execResult = { error: err.message };
      }
    }

    executedNodes.push(nodeId);

    // ── Log step in workflow_run_steps and update workflow_runs context ────
    try {
      if (runId) {
        await admin.from("workflow_run_steps").insert({
          id:           crypto.randomUUID(),
          workspace_id: workspaceId,
          run_id:       runId,
          node_id:      nodeId,
          node_type:    nodeType,
          status:       execResult?.error ? "failed" : (execResult?.skipped ? "skipped" : "completed"),
          input:        { triggerData },
          output:       execResult,
          created_at:   new Date().toISOString(),
        });

        const { data: currentRun } = await admin.from("workflow_runs")
          .select("context")
          .eq("id", runId)
          .single();

        if (currentRun) {
          const ctx = currentRun.context || {};
          const steps_log: any[] = ctx.steps_log ?? [];
          steps_log.push({
            nodeId,
            nodeType,
            executedAt: new Date().toISOString(),
            result:     execResult,
          });

          await admin.from("workflow_runs")
            .update({
              context: {
                ...ctx,
                steps_log,
                last_step: { nodeId, nodeType, result: execResult, at: new Date().toISOString() },
              }
            })
            .eq("id", runId);
        }
      }
    } catch (logErr: any) {
      console.warn(`[executeWorkflowSynchronously] Failed to log step:`, logErr.message);
    }

    if (execResult?.error) {
      await admin.from("workflow_runs").update({
        status:       "failed",
        finished_at:  new Date().toISOString(),
      }).eq("id", runId);
      return { ok: false, executedNodes, error: execResult.error };
    }

    // ── Resolve next nodes and push to queue ───────────────────────────────
    const nextNodeIds = resolveNextNodes(
      nodeId,
      nodeType,
      nodeData,
      condResult,
      edgeMap,
      visited
    );

    for (const nextId of nextNodeIds) {
      if (!visited.has(nextId)) {
        workQueue.push(nextId);
      }
    }
  }

  // ── All reachable synchronous nodes executed ─────────────────────────────
  await admin.from("workflow_runs").update({
    status:       "completed",
    current_node: null,
    finished_at:  new Date().toISOString(),
  }).eq("id", runId);

  return { ok: true, executedNodes };
}

// ── Shared Utilities ───────────────────────────────────────────────────────────

export function buildEdgeMap(edges: any[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const key = `${edge.source}::${edge.sourceHandle ?? "*"}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(edge.target);
  }
  return map;
}

export function getNextFromEdgeMap(nodeId: string, edgeMap: Map<string, string[]>, visited: Set<string>): string[] {
  const output   = edgeMap.get(`${nodeId}::output`) ?? [];
  const wildcard = edgeMap.get(`${nodeId}::*`)       ?? [];
  return [...new Set([...output, ...wildcard])].filter(id => !visited.has(id));
}

export function evaluateCondition(data: any, context: Record<string, any>): boolean {
  const triggerData = context.triggerData ?? {};
  const field       = data.field    ?? "";
  const operator    = data.operator ?? "equals";
  const expected    = data.value    ?? "";
  const parts       = field.split(".");
  const simple      = parts[parts.length - 1];
  const actual      = triggerData[field] ?? triggerData[simple] ?? context[field] ?? "";

  switch (operator) {
    case "equals":      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case "not_equals":  return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case "contains":    return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case "starts_with": return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
    case "not_empty":   return actual !== null && actual !== undefined && String(actual).trim() !== "";
    case "is_empty":    return actual === null || actual === undefined || String(actual).trim() === "";
    case "gt":          return Number(actual) > Number(expected);
    case "lt":          return Number(actual) < Number(expected);
    default:            return false;
  }
}

export function resolveNextNodes(
  nodeId:      string,
  nodeType:    string,
  nodeData:    any,
  condResult:  boolean | null,
  edgeMap:     Map<string, string[]>,
  visited:     Set<string>
): string[] {
  const nextIds: string[] = [];

  if (nodeType === "condition") {
    const branches: any[] = nodeData.branches ?? [
      { id: "true",     type: "true"     },
      { id: "false",    type: "false"    },
      { id: "fallback", type: "fallback" },
    ];

    if (condResult === true) {
      const trueBranch = branches.find(b => b.type === "true");
      if (trueBranch) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${trueBranch.id}`) ?? []));
      }
    } else {
      const falseBranch    = branches.find(b => b.type === "false");
      const fallbackBranch = branches.find(b => b.type === "fallback");

      const falseTargets = falseBranch
        ? (edgeMap.get(`${nodeId}::${falseBranch.id}`) ?? [])
        : [];

      if (falseTargets.length > 0) {
        nextIds.push(...falseTargets);
      } else if (fallbackBranch) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${fallbackBranch.id}`) ?? []));
      }

      for (const cb of branches.filter(b => b.type === "custom")) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${cb.id}`) ?? []));
      }
    }
  } else {
    const output   = edgeMap.get(`${nodeId}::output`) ?? [];
    const wildcard = edgeMap.get(`${nodeId}::*`)       ?? [];
    nextIds.push(...output, ...wildcard);

    if (nodeType === "whatsapp") {
      for (const branch of nodeData.branches ?? []) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${branch.id}`) ?? []));
      }
    }
  }

  return [...new Set(nextIds)].filter(id => !visited.has(id));
}

async function executeNode(node: any, triggerData: any, workspaceId: string, admin: any): Promise<any> {
  const data     = node.data ?? {};
  const nodeType = data.subtype ?? data.type ?? node.type ?? "";

  function sub(str: string): string {
    if (!str) return "";
    return str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
      const simple = key.split(".").pop();
      return triggerData?.[key] ?? triggerData?.[simple] ?? "";
    });
  }

  async function getWAConn() {
    const credentials = await getWhatsAppCredentials(workspaceId, admin);
    return {
      phoneNumId: credentials?.phoneNumberId ?? "",
      token:      credentials?.accessToken   ?? "",
    };
  }

  switch (nodeType) {
    case "trigger": case "google_sheet": case "webhook": case "form":
      return { triggered: true };

    case "whatsapp":
    case "whatsapp_message": {
      const phone = sub(data.toPhone ?? triggerData?.phone ?? "").replace(/\D/g, "");
      if (!phone) return { skipped: "no phone" };

      const { phoneNumId, token } = await getWAConn();
      if (!phoneNumId || !token) return { error: "no credentials" };

      const template = data.templateName ?? data.template;
      const msgText  = sub(data.message ?? data.body ?? "");

      const { sendTemplateMessage, sendTextMessage } = await import("@/lib/whatsapp/meta-api");

      if (template) {
        let processedComponents: any[] | undefined = undefined;
        if (Array.isArray(data.components)) {
          processedComponents = data.components.map((c: any) => ({
            ...c,
            parameters: c.parameters?.map((p: any) => {
              if (p.type === "text" && typeof p.text === "string") {
                return { ...p, text: sub(p.text) };
              }
              return p;
            })
          }));
        }

        await sendTemplateMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          templateName: template,
          language: data.templateLanguage ?? "en",
          components: processedComponents,
        });
      } else {
        await sendTextMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          text: msgText,
        });
      }
      return { sent: true, phone };
    }

    case "email": {
      const { sendMail } = await import("@/services/mailer");
      const to = sub(data.toEmail ?? triggerData?.email ?? "");
      if (!to) return { skipped: "no email" };
      await sendMail(
        {
          smtp_host:       data.smtpHost   ?? process.env.SMTP_HOST ?? "",
          smtp_port:       parseInt(data.smtpPort ?? process.env.SMTP_PORT ?? "587"),
          smtp_user:       data.smtpUser   ?? process.env.SMTP_USER ?? "",
          smtp_password:   data.smtpPass   ?? process.env.SMTP_PASS ?? "",
          email_from_name: data.fromName   ?? "Flowra",
          email_from:      data.fromEmail  ?? process.env.SMTP_USER ?? "",
        },
        to,
        sub(data.subject ?? "Hello"),
        sub(data.html ?? data.body ?? "<p>Hello!</p>")
      );
      return { sent: true, to };
    }

    case "voice": case "voice_call": {
      const { initiateVoiceCall } = await import("@/services/voice");
      const phone = sub(data.toPhone ?? triggerData?.phone ?? "").replace(/\D/g, "");
      if (!phone) return { skipped: "no phone" };

      try {
        await initiateVoiceCall({
          supabase: admin,
          workspaceId: workspaceId,
          toNumber: phone,
          agentType: data.agentType ?? "livekit",
          voiceId: data.voiceId ?? "anushka",
          systemPrompt: data.systemPrompt ? sub(data.systemPrompt) : undefined,
          presetId: data.presetId,
          metadataSource: "workflow_builder"
        });
        return { called: true, phone };
      } catch (err: any) {
        throw new Error(`Voice dial failed: ${err.message}`);
      }
    }

    case "update_crm": case "crm": {
      const phone = (triggerData?.phone ?? "").replace(/\D/g, "");
      if (!phone) return { skipped: "no phone" };
      await admin.from("contacts").upsert({
        workspace_id: workspaceId,
        phone,
        full_name:    triggerData?.name  ?? "",
        email:        triggerData?.email ?? "",
        stage:        data.stage ?? "new_lead",
      }, { onConflict: "workspace_id,phone" });
      return { updated: true, stage: data.stage };
    }

    case "condition":
      return { handled_by_router: true };

    case "delay":
      return { delayed: true };

    default:
      return { skipped: `unknown: ${nodeType}` };
  }
}
