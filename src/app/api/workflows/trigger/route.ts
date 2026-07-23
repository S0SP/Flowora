import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getTenant } from "@/lib/tenant"
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth"

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
      await executeWorkflow({ workflow, nodes: actualNodes, edges: actualEdges, triggerData, workspaceId, run, admin })

      await admin.from("workflow_runs").update({
        status:          "completed",
        finished_at:     new Date().toISOString(),
        context: {
          ...run.context,
          steps_completed: nodesCount,
        }
      }).eq("id", run.id)

    } catch (execErr: any) {
      await admin.from("workflow_runs").update({
        status:        "failed",
        finished_at:   new Date().toISOString(),
        context: {
          ...run.context,
          error_message: execErr.message ?? "Execution failed",
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

// ── Main Workflow Executor ────────────────────────────────────────────────────
async function executeWorkflow(opts: {
  workflow:    any
  nodes:       any[]
  edges:       any[]
  triggerData: any
  workspaceId: string
  run:         any
  admin:       Awaited<ReturnType<typeof createAdminClient>>
}) {
  const { workflow, nodes, edges, triggerData, workspaceId, run, admin } = opts

  const edgeMap  = buildEdgeMap(edges)
  const nodeMap  = new Map(nodes.map(n => [n.id, n]))
  const visited  = new Set<string>()
  const context: Record<string, any> = { triggerData }

  // Find trigger node
  const triggerNode = nodes.find(n =>
    n.type === "trigger" ||
    n.data?.type === "trigger" ||
    n.data?.subtype === "google_sheet" ||
    n.data?.subtype === "webhook" ||
    n.data?.subtype === "form"
  )
  if (!triggerNode) return

  // BFS queue — each item is a node ID to process
  const queue: string[] = [triggerNode.id]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) continue

    const nodeData = node.data ?? {}
    const nodeType = nodeData.subtype ?? nodeData.type ?? node.type ?? ""

    // ── Execute node ──────────────────────────────────────────────────────
    let result: any     = {}
    let condResult: boolean | null = null

    try {
      if (nodeType === "condition") {
        // Evaluate condition — result determines which branch to follow
        condResult = evaluateCondition(nodeData, context)
        result     = { condition: condResult, field: nodeData.field, operator: nodeData.operator, value: nodeData.value }
      } else {
        result = await executeNode({ node, context, workspaceId, admin })
      }
      context[nodeId] = result
    } catch (err: any) {
      console.error(`[workflow] Node ${nodeId} (${nodeType}) failed:`, err.message)
      context[nodeId] = { error: err.message }
      // Continue to next nodes despite error (non-fatal)
    }

    // Handle delay: short delays block inline, long delays log and continue
    if (nodeType === "delay") {
      const totalMs =
        ((nodeData.delayDays    ?? 0) * 86400 +
         (nodeData.delayHours   ?? 0) * 3600  +
         (nodeData.delayMinutes ?? 0) * 60) * 1000

      if (totalMs > 0 && totalMs <= 10_000) {
        // Very short delay (≤10s) — block inline for test runs
        await new Promise(r => setTimeout(r, totalMs))
      } else if (totalMs > 10_000) {
        // Long delay — log it. In production this should be handled by QStash
        // (see /api/jobs/workflow-step). For now we skip waiting.
        console.log(`[workflow] Delay node ${nodeId}: ${totalMs / 1000}s — skipping in sync execution`)
      }
    }

    // ── Resolve next nodes based on type and condition result ────────────
    const nextIds = resolveNextNodes(nodeId, nodeType, nodeData, condResult, edgeMap, visited)
    queue.push(...nextIds)

    // Update progress in DB
    try {
      await admin.from("workflow_runs").update({ steps_completed: visited.size }).eq("id", run.id)
    } catch {}
  }
}

// ── Individual Node Executor ───────────────────────────────────────────────────
async function executeNode(opts: {
  node:        any
  context:     Record<string, any>
  workspaceId: string
  admin:       Awaited<ReturnType<typeof createAdminClient>>
}): Promise<any> {
  const { node, context, workspaceId, admin } = opts
  const data        = node.data ?? {}
  const triggerData = context.triggerData ?? {}
  const nodeType    = data.subtype ?? data.type ?? node.type ?? ""

  function getNestedValue(obj: any, path: string): any {
    if (!obj) return undefined
    return path.split('.').reduce((acc, part) => acc && acc[part], obj)
  }

  function sub(str: string): string {
    if (!str) return ""
    return str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const trimmed = key.trim()
      const val = getNestedValue(triggerData, trimmed) ?? getNestedValue(context, trimmed)
      if (val !== undefined && val !== null) {
        return String(val)
      }
      const parts = trimmed.split(".")
      const simple = parts[parts.length - 1]
      return triggerData[simple] ?? context[simple] ?? ""
    })
  }

  // Get WhatsApp credentials
  async function getWAConn() {
    const credentials = await getWhatsAppCredentials(workspaceId, admin)
    return {
      phoneNumId: credentials?.phoneNumberId ?? "",
      token:      credentials?.accessToken   ?? "",
    }
  }

  switch (nodeType) {
    // ── Trigger nodes — no-op ───────────────────────────────────────────────
    case "trigger":
    case "google_sheet":
    case "webhook":
    case "form":
      return { triggered: true }

    // ── WhatsApp ────────────────────────────────────────────────────────────
    case "whatsapp":
    case "whatsapp_message": {
      const phone = sub(triggerData.phone ?? data.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone number" }

      const { phoneNumId, token } = await getWAConn()
      if (!phoneNumId || !token) return { error: "WhatsApp credentials not configured" }

      const template    = data.templateName ?? data.template_name ?? ""
      const messageText = sub(data.message ?? data.body ?? "")
      
      const { sendTemplateMessage, sendTextMessage } = await import("@/lib/whatsapp/meta-api")

      if (template) {
        let paramsArray: string[] | undefined = undefined
        if (data.variables && Object.keys(data.variables).length > 0) {
          paramsArray = Object.entries(data.variables)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([_, val]) => sub(String(val)))
        } else if (data.components) {
          for (const comp of data.components) {
            if (comp.type === "BODY" && comp.example?.body_text) {
              paramsArray = comp.example.body_text[0].map((v: string) => sub(v))
            }
          }
        }

        const result = await sendTemplateMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          templateName: template,
          language: data.templateLanguage ?? "en",
          params: paramsArray,
        })
        return { sent: true, messageId: result.messageId, phone }
      } else if (messageText) {
        const result = await sendTextMessage({
          phoneNumberId: phoneNumId,
          accessToken: token,
          to: phone,
          text: messageText,
        })
        return { sent: true, messageId: result.messageId, phone }
      } else {
        return { skipped: "no template or message body" }
      }
    }

    // ── Email ───────────────────────────────────────────────────────────────
    case "email": {
      const { sendMail } = await import("@/services/mailer")
      const to = sub(data.toEmail ?? triggerData.email ?? "")
      if (!to) return { skipped: "no email address" }

      // Get SMTP config from workspace settings if not in node data
      const { data: settings } = await admin
        .from("app_settings")
        .select("value")
        .eq("workspace_id", workspaceId)
        .eq("key", "email_settings")
        .maybeSingle()

      const emailCfg = settings?.value as any ?? {}

      await sendMail(
        {
          smtp_host:         data.smtpHost     ?? emailCfg.smtp_host     ?? process.env.SMTP_HOST     ?? "",
          smtp_port:         parseInt(data.smtpPort ?? emailCfg.smtp_port ?? process.env.SMTP_PORT ?? "587"),
          smtp_user:         data.smtpUser     ?? emailCfg.smtp_user     ?? process.env.SMTP_USER     ?? "",
          smtp_password:     data.smtpPass     ?? emailCfg.smtp_password  ?? process.env.SMTP_PASS     ?? "",
          email_from_name:   data.fromName     ?? emailCfg.email_from_name ?? "Flowra",
          email_from:        data.fromEmail    ?? emailCfg.email_from     ?? process.env.SMTP_USER     ?? "",
        },
        to,
        sub(data.subject ?? "Hello"),
        sub(data.html    ?? data.body ?? "<p>Hello!</p>")
      )
      return { sent: true, to }
    }

    // ── Voice Call ──────────────────────────────────────────────────────────
    case "voice":
    case "voice_call": {
      const phone = sub(data.toPhone ?? triggerData.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone number" }

      const agentType = data.agentType ?? "livekit"
      const voiceId = data.voiceId ?? "anushka"

      // 1. Fetch channel connection to get dograhWorkflowId
      const { data: voiceConn } = await admin
        .from("channel_connections")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("type", "voice")
        .maybeSingle()

      let dograhWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10)
      if (voiceConn?.config?.dograhWorkflowId) {
        const parsedId = parseInt(voiceConn.config.dograhWorkflowId, 10)
        if (!isNaN(parsedId)) {
          dograhWorkflowId = parsedId
        }
      }

      // Preset Override
      if (data.voice_agent_id) {
        const { data: preset } = await admin
          .from("voice_agents")
          .select("dograh_workflow_id")
          .eq("id", data.voice_agent_id)
          .maybeSingle()
        if (preset?.dograh_workflow_id) {
          dograhWorkflowId = preset.dograh_workflow_id
        }
      }

      // 2. Insert call record into `voice_calls`
      // Try to find a workspace owner or at least a member to associate the call with
      const { data: member } = await admin
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .limit(1)
        .maybeSingle()

      let dialUserId = member?.user_id

      let callRecordId = null
      let roomName = ""
      let sipCallId = ""

      const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000"
      const flowraSecret = process.env.DOGRAH_SECRET || process.env.DOGRAH_API_SECRET || "change-me-in-production"

      const systemPrompt = sub(data.systemPrompt ?? "")
      const callObjective = sub(data.callObjective ?? "")

      const modelOverrides = agentType === "gemini"
        ? {
          is_realtime: true,
          realtime: {
            provider: "google_realtime",
            model: "gemini-3.1-flash-live-preview",
            voice: voiceId,
            language: "en-US",
          },
        }
        : {
          is_realtime: false,
          tts: {
            provider: "sarvam",
            voice: voiceId,
            language: "hi-IN",
          },
          llm: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
          },
        }

      const initialContext = {
        system_prompt: systemPrompt,
        first_message: "",
        call_objective: callObjective,
        model_overrides: modelOverrides,
      }

      // 3. Initiate call via Dograh
      try {
        const dograhRes = await fetch(`${dograhUrl}/api/v1/telephony/initiate-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${flowraSecret}`
          },
          body: JSON.stringify({
            telephony_provider: "voicelink",
            workflow_id: dograhWorkflowId,
            to_number: phone,
            metadata: {
              flowra_source: "workflow_builder",
              workspace_id: workspaceId
            },
            initial_context: initialContext,
          }),
        })

        if (!dograhRes.ok) {
          const errText = await dograhRes.text()
          throw new Error(`Dograh API error: ${errText}`)
        }

        const dograhData = await dograhRes.json()
        roomName = `run-${dograhData.workflow_run_id}`
        sipCallId = String(dograhData.workflow_run_id)
      } catch (err: any) {
        throw new Error(err.message ?? "Voice dial failed")
      }

      // 4. Update the DB call record now that we have the roomName and sipCallId
      if (dialUserId) {
        try {
          const { data: callRecord } = await admin
            .from("voice_calls")
            .insert({
              user_id: dialUserId,
              phone_number: phone,
              agent_type: agentType,
              voice_id: voiceId,
              status: "ringing",
              livekit_room_name: roomName,
              livekit_sip_call_id: sipCallId,
            })
            .select("id")
            .single()
            
          callRecordId = callRecord?.id
        } catch (recErr) {
          console.warn("[workflow] could not write voice_calls record:", recErr)
        }
      }

      return { called: true, callId: callRecordId, phone }
    }

    // ── Delay — handled in main loop ────────────────────────────────────────
    case "delay":
      return { delayed: true, minutes: (data.delayDays ?? 0) * 1440 + (data.delayHours ?? 0) * 60 + (data.delayMinutes ?? 0) }

    // ── Condition — handled in main loop ────────────────────────────────────
    case "condition":
      return { handled_by_router: true }

    // ── Update CRM ──────────────────────────────────────────────────────────
    case "update_crm":
    case "crm":
    case "update_contact": {
      const phone = sub(triggerData.phone ?? data.phone ?? "").replace(/\D/g, "")
      if (!phone) return { skipped: "no phone for CRM update" }

      const { error } = await admin.from("contacts").upsert({
        workspace_id: workspaceId,
        phone,
        full_name:    sub(data.name  ?? triggerData.name  ?? ""),
        email:        sub(data.email ?? triggerData.email ?? ""),
        stage:        data.stage ?? "new_lead",
        tags:         data.tags  ? data.tags.split(",").map((t: string) => t.trim()) : [],
      }, { onConflict: "workspace_id,phone" })

      if (error) throw new Error(error.message)
      return { updated: true, stage: data.stage, phone }
    }

    // ── Reminder ────────────────────────────────────────────────────────────
    case "reminder": {
      // Schedule reminders via scheduler service
      const phone       = sub(triggerData.phone ?? "").replace(/\D/g, "")
      const eventDate   = data.eventDate ?? ""
      const reminders   = data.reminders ?? []

      if (!phone || !eventDate) return { skipped: "missing phone or eventDate" }

      const eventTime = new Date(eventDate).getTime()
      const now       = Date.now()

      for (const reminder of reminders) {
        const whenMs    = parseReminderOffset(reminder.when)
        const fireAt    = eventTime - whenMs
        const delayMs   = fireAt - now

        if (delayMs < 0) {
          console.log(`[reminder] Skipping past reminder: ${reminder.when}`)
          continue
        }

        // For production: enqueue with QStash
        // For now: log scheduled reminder
        console.log(`[reminder] Scheduled ${reminder.when} before event: fire in ${Math.round(delayMs / 60000)} min`)
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