import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { enqueue } from "@/lib/qstash"

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    let workflowId = req.nextUrl.searchParams.get("workflowId")
    let body: any = {}
    try {
      body = await req.json()
    } catch {}

    let triggerData = body.triggerData || body
    if (!workflowId) {
      workflowId = body.workflowId
    }
    let workspaceId = body.workspaceId

    if (!workspaceId) {
      try { const t = await getTenant(); workspaceId = t.workspaceId } catch {}
    }

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Fetch the workflow (using UUID, globally unique)
    let query = admin.from("workflows").select("*").eq("id", workflowId)
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    const { data: workflow, error } = await query.single()

    if (error || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
    }

    // Set correct workspaceId from workflow record if not determined yet
    if (!workspaceId) {
      workspaceId = workflow.workspace_id
    }

    const nodesCount = (workflow.graph?.nodes ?? workflow.nodes ?? []).length
    
    // Create run record
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
          steps_total:   nodesCount,
        }
      })
      .select()
      .single()

    if (!run) {
      return NextResponse.json({ error: "Failed to create run record" }, { status: 500 })
    }

    try {
      const actualNodes = workflow.graph?.nodes ?? workflow.nodes ?? []
      const actualEdges = workflow.graph?.edges ?? workflow.edges ?? []
      
      const triggerNode = actualNodes.find((n: any) =>
        n.type === "trigger" ||
        n.data?.type === "trigger" ||
        n.data?.subtype === "google_sheet" ||
        n.data?.subtype === "webhook" ||
        n.data?.subtype === "form"
      )

      if (!triggerNode) {
        throw new Error("No trigger node found in workflow")
      }

      const edgeMap = buildEdgeMap(actualEdges)
      const nextNodeIds = resolveNextNodes(triggerNode.id, triggerNode.data?.subtype ?? triggerNode.data?.type ?? triggerNode.type, triggerNode.data, null, edgeMap, new Set([triggerNode.id]))

      for (const nextNodeId of nextNodeIds) {
        await enqueue(
          "/api/jobs/workflow-step",
          { workflowId, workspaceId, nodeId: nextNodeId, triggerData, runId: run.id, visitedNodeIds: [triggerNode.id] },
          { retries: 3 }
        )
      }

      await admin.from("workflow_runs").update({
        context: {
          ...run.context,
          steps_completed: 1,
        }
      }).eq("id", run.id)

    } catch (execErr: any) {
      await admin.from("workflow_runs").update({
        status:        "failed",
        finished_at:   new Date().toISOString(),
        context: {
          ...run.context,
          error_message: execErr.message ?? "Failed to enqueue initial steps",
        }
      }).eq("id", run.id)
      throw execErr
    }

    return NextResponse.json({ runId: run.id, ok: true })
  } catch (err: any) {
    console.error("[workflows/trigger POST]", err)
    return NextResponse.json({ error: err.message ?? "Trigger failed" }, { status: 500 })
  }
}

// ── Condition Evaluator ────────────────────────────────────────────────────────
function evaluateCondition(data: any, context: Record<string, any>): boolean {
  const field    = data.field    ?? ""
  const operator = data.operator ?? "equals"
  const expected = data.value    ?? ""

  // Resolve value from trigger data or prior node context
  const triggerData = context.triggerData ?? {}
  const actual = triggerData[field] ?? context[field] ?? ""

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

// ── Build a map of: sourceNodeId+handleId → targetNodeId ─────────────────────
function buildEdgeMap(edges: any[]): Map<string, string[]> {
  // Key format: "nodeId::handleId" or "nodeId::*" for non-branch edges
  const map = new Map<string, string[]>()

  for (const edge of edges) {
    // sourceHandle is the branch id (e.g. "true", "false", "btn_0_yes", "fallback")
    // If no sourceHandle, use wildcard "*"
    const key = `${edge.source}::${edge.sourceHandle ?? "*"}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(edge.target)
  }

  return map
}

// ── Resolve next node IDs respecting branch handles ──────────────────────────
function resolveNextNodes(
  nodeId:      string,
  nodeType:    string,
  nodeData:    any,
  condResult:  boolean | null,
  edgeMap:     Map<string, string[]>,
  visitedNodeIds: Set<string>
): string[] {
  const nextIds: string[] = []

  if (nodeType === "condition") {
    // ── Condition node: route by True / False / Fallback / Custom ──────────
    const branches: any[] = nodeData.branches ?? [
      { id: "true",     type: "true"     },
      { id: "false",    type: "false"    },
      { id: "fallback", type: "fallback" },
    ]

    if (condResult === true) {
      // Route True branch
      const trueBranch = branches.find(b => b.type === "true")
      if (trueBranch) {
        const key = `${nodeId}::${trueBranch.id}`
        const targets = edgeMap.get(key) ?? []
        nextIds.push(...targets)
      }
    } else {
      // Route False branch first, then Fallback if no False connection
      const falseBranch    = branches.find(b => b.type === "false")
      const fallbackBranch = branches.find(b => b.type === "fallback")

      const falseTargets = falseBranch
        ? (edgeMap.get(`${nodeId}::${falseBranch.id}`) ?? [])
        : []

      if (falseTargets.length > 0) {
        nextIds.push(...falseTargets)
      } else if (fallbackBranch) {
        const fbTargets = edgeMap.get(`${nodeId}::${fallbackBranch.id}`) ?? []
        nextIds.push(...fbTargets)
      }

      // Also route custom branches that evaluated (future: multi-branch conditions)
      const customBranches = branches.filter(b => b.type === "custom")
      for (const cb of customBranches) {
        const targets = edgeMap.get(`${nodeId}::${cb.id}`) ?? []
        nextIds.push(...targets)
      }
    }
  } else if (nodeType === "whatsapp" && (nodeData.branches ?? []).length > 0) {
    // ── WhatsApp node: for now route all non-fallback branches (async reply
    //    routing happens via webhook, here we continue the "sent" path) ──────
    const allWildcard = edgeMap.get(`${nodeId}::*`) ?? []
    const allOutput   = edgeMap.get(`${nodeId}::output`) ?? []
    nextIds.push(...allWildcard, ...allOutput)

    // Also include any explicitly wired button branches
    for (const branch of nodeData.branches ?? []) {
      const targets = edgeMap.get(`${nodeId}::${branch.id}`) ?? []
      nextIds.push(...targets)
    }
  } else {
    // ── Standard node: follow any edge from this node ─────────────────────
    // Try specific output handle first, then wildcard
    const outputTargets   = edgeMap.get(`${nodeId}::output`) ?? []
    const wildcardTargets = edgeMap.get(`${nodeId}::*`)       ?? []
    nextIds.push(...outputTargets, ...wildcardTargets)
  }

  // De-duplicate and filter already-visited
  return [...new Set(nextIds)].filter(id => !visitedNodeIds.has(id))
}

      }
      return { scheduled: reminders.length, eventDate }
    }

    // ── Webhook / HTTP Request ──────────────────────────────────────────────
    case "webhook":
    case "http_request": {
      const url = data.url ?? ""
      if (!url) return { skipped: "no URL configured" }

      let headers: Record<string, string> = { "Content-Type": "application/json" }
      if (data.headers) {
        try { headers = { ...headers, ...JSON.parse(data.headers) } } catch {}
      }

      const res = await fetch(url, {
        method:  data.method ?? "POST",
        headers,
        body:    JSON.stringify({ ...triggerData, ...context }),
      })
      return { status: res.status, ok: res.ok }
    }

    default:
      console.warn(`[executeNode] Unknown node type: ${nodeType}`)
      return { skipped: `unknown node type: ${nodeType}` }
  }
}

// ── Helper: parse reminder offset strings like "3d", "1h", "30m" ─────────────
function parseReminderOffset(when: string): number {
  const num  = parseInt(when)
  if (isNaN(num)) return 0
  if (when.endsWith("d")) return num * 86400 * 1000
  if (when.endsWith("h")) return num * 3600  * 1000
  if (when.endsWith("m")) return num * 60    * 1000
  return 0
}