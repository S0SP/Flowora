/**
 * QStash Job: Execute a single workflow step (node).
 * Handles condition branching, delay scheduling, and all node types.
 * Called by QStash with an optional delay for drip campaigns.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { enqueue } from "@/lib/qstash"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"

export const runtime    = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      workflowId,
      workspaceId,
      nodeId,
      triggerData,
      runId,
      visitedNodeIds = [],
      // Branch context: which handle brought us here
      incomingBranchType = null,
    } = body

    if (!workflowId || !workspaceId || !nodeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const admin = await createAdminClient()

    const { data: workflow } = await admin
      .from("workflows")
      .select("nodes, edges, status")
      .eq("id", workflowId)
      .eq("workspace_id", workspaceId)
      .single()

    if (!workflow || workflow.status !== "active") {
      return NextResponse.json({ message: "Workflow inactive or not found" })
    }

    // CRITICAL FIX: nodes/edges are stored inside workflow.graph, not top-level
    const nodes: any[] = (workflow as any).graph?.nodes ?? (workflow as any).nodes ?? []
    const edges: any[] = (workflow as any).graph?.edges ?? (workflow as any).edges ?? []

    console.log(`[workflow-step] workflowId=${workflowId} nodeId=${nodeId} nodes=${nodes.length} edges=${edges.length} runId=${runId}`)

    const currentNode = nodes.find(n => n.id === nodeId)
    if (!currentNode) {
      console.error(`[workflow-step] Node ${nodeId} not found in workflow ${workflowId}. Available node IDs: ${nodes.map((n:any)=>n.id).join(", ")}`)
      return NextResponse.json({ message: "Node not found", availableNodes: nodes.map((n:any)=>n.id) })
    }

    const nodeData = currentNode.data ?? {}
    const nodeType = nodeData.subtype ?? nodeData.type ?? currentNode.type ?? ""

    // ── Build edge map ──────────────────────────────────────────────────────
    const edgeMap = buildEdgeMap(edges)
    const newVisited = [...visitedNodeIds, nodeId]

    // ── Evaluate condition ──────────────────────────────────────────────────
    let condResult: boolean | null = null
    let execResult: any = {}

    if (nodeType === "condition") {
      condResult = evaluateCondition(nodeData, { triggerData })
      execResult = { condition: condResult }
      console.log(`[workflow-step] Condition node ${nodeId}: result=${condResult}`)
    } else {
      try {
        console.log(`[workflow-step] Executing node ${nodeId} type=${nodeType}`)
        execResult = await executeNode(currentNode, triggerData, workspaceId, admin)
        console.log(`[workflow-step] Node ${nodeId} result:`, JSON.stringify(execResult))
      } catch (err: any) {
        console.error(`[workflow-step] Node ${nodeId} error:`, err.message)
        execResult = { error: err.message }
      }
    }

    // ── Resolve next nodes ──────────────────────────────────────────────────
    const nextNodeIds = resolveNextNodes(
      nodeId,
      nodeType,
      nodeData,
      condResult,
      edgeMap,
      new Set(newVisited)
    )

    // ── Enqueue next steps ──────────────────────────────────────────────────
    for (const nextNodeId of nextNodeIds) {
      const nextNode = nodes.find(n => n.id === nextNodeId)
      if (!nextNode) continue

      const nextType = nextNode.data?.subtype ?? nextNode.data?.type ?? nextNode.type ?? ""

      if (nextType === "delay") {
        // Calculate delay, then enqueue nodes AFTER the delay node
        const d = nextNode.data ?? {}
        const totalSec =
          (d.delayDays    ?? 0) * 86400 +
          (d.delayHours   ?? 0) * 3600  +
          (d.delayMinutes ?? 0) * 60

        const afterDelayIds = getNextFromEdgeMap(nextNodeId, edgeMap, new Set([...newVisited, nextNodeId]))

        for (const afterId of afterDelayIds) {
          await enqueue(
            "/api/jobs/workflow-step",
            { workflowId, workspaceId, nodeId: afterId, triggerData, runId, visitedNodeIds: [...newVisited, nextNodeId] },
            { delay: totalSec > 0 ? totalSec : undefined, retries: 3 }
          )
        }
      } else {
        // Enqueue immediately
        await enqueue(
          "/api/jobs/workflow-step",
          { workflowId, workspaceId, nodeId: nextNodeId, triggerData, runId, visitedNodeIds: newVisited },
          { retries: 3 }
        )
      }
    }

    // Log this step to the proper workflow_run_steps table (per schema)
    // Also update workflow_runs.context with step log for the UI
    try {
      if (runId) {
        // 1. Insert into workflow_run_steps (proper normalized table)
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
        })

        // 2. Update workflow_runs context with step log array for UI display
        const { data: currentRun } = await admin.from("workflow_runs")
          .select("context")
          .eq("id", runId)
          .single()

        if (currentRun) {
          const ctx = currentRun.context || {}
          const steps_log: any[] = ctx.steps_log ?? []
          steps_log.push({
            nodeId,
            nodeType,
            executedAt: new Date().toISOString(),
            result:     execResult,
            nextNodes:  nextNodeIds,
          })

          const isLast   = nextNodeIds.length === 0
          const newStatus = execResult?.error ? "failed" : (isLast ? "completed" : "running")

          // Only update columns that EXIST in the schema: status, context, finished_at, current_node
          await admin.from("workflow_runs")
            .update({
              status:       newStatus,
              current_node: isLast ? null : nextNodeIds[0] ?? null,
              finished_at:  isLast ? new Date().toISOString() : null,
              context: {
                ...ctx,
                steps_log,
                last_step: { nodeId, nodeType, result: execResult, at: new Date().toISOString() },
              }
            })
            .eq("id", runId)
        }
      }
    } catch (logErr: any) {
      console.warn(`[workflow-step] Failed to log step:`, logErr.message)
    }

    return NextResponse.json({ ok: true, nodeId, result: execResult, nextNodeIds })
  } catch (err: any) {
    console.error("[jobs/workflow-step]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── Shared Utilities (duplicated from trigger route for QStash isolation) ─────

function buildEdgeMap(edges: any[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const edge of edges) {
    const key = `${edge.source}::${edge.sourceHandle ?? "*"}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(edge.target)
  }
  return map
}

function getNextFromEdgeMap(nodeId: string, edgeMap: Map<string, string[]>, visited: Set<string>): string[] {
  const output   = edgeMap.get(`${nodeId}::output`) ?? []
  const wildcard = edgeMap.get(`${nodeId}::*`)       ?? []
  return [...new Set([...output, ...wildcard])].filter(id => !visited.has(id))
}

function evaluateCondition(data: any, context: Record<string, any>): boolean {
  const triggerData = context.triggerData ?? {}
  const field       = data.field    ?? ""
  const operator    = data.operator ?? "equals"
  const expected    = data.value    ?? ""
  const parts       = field.split(".")
  const simple      = parts[parts.length - 1]
  const actual      = triggerData[field] ?? triggerData[simple] ?? context[field] ?? ""

  switch (operator) {
    case "equals":      return String(actual).toLowerCase() === String(expected).toLowerCase()
    case "not_equals":  return String(actual).toLowerCase() !== String(expected).toLowerCase()
    case "contains":    return String(actual).toLowerCase().includes(String(expected).toLowerCase())
    case "starts_with": return String(actual).toLowerCase().startsWith(String(expected).toLowerCase())
    case "not_empty":   return actual !== null && actual !== undefined && String(actual).trim() !== ""
    case "is_empty":    return actual === null || actual === undefined || String(actual).trim() === ""
    case "gt":          return Number(actual) > Number(expected)
    case "lt":          return Number(actual) < Number(expected)
    default:            return false
  }
}

function resolveNextNodes(
  nodeId:      string,
  nodeType:    string,
  nodeData:    any,
  condResult:  boolean | null,
  edgeMap:     Map<string, string[]>,
  visited:     Set<string>
): string[] {
  const nextIds: string[] = []

  if (nodeType === "condition") {
    const branches: any[] = nodeData.branches ?? [
      { id: "true",     type: "true"     },
      { id: "false",    type: "false"    },
      { id: "fallback", type: "fallback" },
    ]

    if (condResult === true) {
      const trueBranch = branches.find(b => b.type === "true")
      if (trueBranch) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${trueBranch.id}`) ?? []))
      }
    } else {
      const falseBranch    = branches.find(b => b.type === "false")
      const fallbackBranch = branches.find(b => b.type === "fallback")

      const falseTargets = falseBranch
        ? (edgeMap.get(`${nodeId}::${falseBranch.id}`) ?? [])
        : []

      if (falseTargets.length > 0) {
        nextIds.push(...falseTargets)
      } else if (fallbackBranch) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${fallbackBranch.id}`) ?? []))
      }

      // Custom branches also evaluated
      for (const cb of branches.filter(b => b.type === "custom")) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${cb.id}`) ?? []))
      }
    }
  } else {
    // Standard: output handle then wildcard
    const output   = edgeMap.get(`${nodeId}::output`) ?? []
    const wildcard = edgeMap.get(`${nodeId}::*`)       ?? []
    nextIds.push(...output, ...wildcard)

    // WhatsApp button branches
    if (nodeType === "whatsapp") {
      for (const branch of nodeData.branches ?? []) {
        nextIds.push(...(edgeMap.get(`${nodeId}::${branch.id}`) ?? []))
      }
    }
  }

  return [...new Set(nextIds)].filter(id => !visited.has(id))
}

// ── Node Executor ──────────────────────────────────────────────────────────────
async function executeNode(node: any, triggerData: any, workspaceId: string, admin: any): Promise<any> {
  const data     = node.data ?? {}
  const nodeType = data.subtype ?? data.type ?? node.type ?? ""

  function sub(str: string): string {
    if (!str) return ""
    return str.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
      const simple = key.split(".").pop()
      return triggerData?.[key] ?? triggerData?.[simple] ?? ""
    })
  }

  async function getWAConn() {
    const credentials = await getWhatsAppCredentials(workspaceId, admin)
    return {
      phoneNumId: credentials?.phoneNumberId ?? "",
      token:      credentials?.accessToken   ?? "",
    }
  }

  switch (nodeType) {
    case "trigger": case "google_sheet": case "webhook": case "form":
      return { triggered: true }

    case "whatsapp":
    case "whatsapp_message": {
      const phone = sub(data.toPhone ?? triggerData?.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone" }

      const { phoneNumId, token } = await getWAConn()
      if (!phoneNumId || !token) return { error: "no credentials" }

      const template = data.templateName ?? data.template
      const msgText  = sub(data.message ?? data.body ?? "")

      const { sendTemplateMessage, sendTextMessage } = await import("@/lib/whatsapp/meta-api")

      if (template) {
        // Resolve dynamic variables in template components
        let processedComponents: any[] | undefined = undefined
        if (Array.isArray(data.components)) {
          processedComponents = data.components.map((c: any) => ({
            ...c,
            parameters: c.parameters?.map((p: any) => {
              if (p.type === "text" && typeof p.text === "string") {
                return { ...p, text: sub(p.text) }
              }
              return p
            })
          }))
        }

        await sendTemplateMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          templateName: template,
          language: data.templateLanguage ?? "en",
          components: processedComponents,
        })
      } else {
        await sendTextMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          text: msgText,
        })
      }
      return { sent: true, phone }
    }

    case "email": {
      const { sendMail } = await import("@/services/mailer")
      const to = sub(data.toEmail ?? triggerData?.email ?? "")
      if (!to) return { skipped: "no email" }
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
      )
      return { sent: true, to }
    }

    case "voice": case "voice_call": {
      const { initiateVoiceCall } = await import("@/services/voice")
      const phone = sub(data.toPhone ?? triggerData?.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone" }
      
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
        })
        return { called: true, phone }
      } catch (err: any) {
        throw new Error(`Voice dial failed: ${err.message}`)
      }
    }

    case "update_crm": case "crm": {
      const phone = (triggerData?.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone" }
      await admin.from("contacts").upsert({
        workspace_id: workspaceId,
        phone,
        full_name:    triggerData?.name  ?? "",
        email:        triggerData?.email ?? "",
        stage:        data.stage ?? "new_lead",
      }, { onConflict: "workspace_id,phone" })
      return { updated: true, stage: data.stage }
    }

    case "condition":
      return { handled_by_router: true }

    case "delay":
      return { delayed: true }

    default:
      return { skipped: `unknown: ${nodeType}` }
  }
}