/**
 * API Route: /api/jobs/workflow-step
 * Calls synchronous workflow execution from library.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeWorkflowSynchronously } from "@/lib/workflow/executor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workflowId,
      workspaceId,
      nodeId,
      triggerData,
      runId,
      visitedNodeIds = [],
    } = body;

    if (!workflowId || !workspaceId || !nodeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await executeWorkflowSynchronously({
      runId,
      workflowId,
      workspaceId,
      startNodeIds: [nodeId],
      triggerData,
      visitedNodeIds,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, executedNodes: result.executedNodes }, { status: 500 });
    }

    return NextResponse.json({ ok: true, executedNodes: result.executedNodes, sleepingAt: result.sleepingAt });
  } catch (err: any) {
    console.error("[jobs/workflow-step]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}