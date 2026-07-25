import { NextRequest, NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";
import { runWorkflowTrigger } from "@/lib/workflow/trigger";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    let workflowId = req.nextUrl.searchParams.get("workflowId");
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    let triggerData = body.triggerData || body;
    if (!workflowId) {
      workflowId = body.workflowId;
    }
    let workspaceId = body.workspaceId;

    if (!workspaceId) {
      try { const t = await getTenant(); workspaceId = t.workspaceId; } catch {}
    }

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }

    const result = await runWorkflowTrigger({
      workflowId,
      workspaceId,
      triggerData,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, runId: result.runId }, { status: result.error === "Workflow not found" ? 404 : 500 });
    }

    return NextResponse.json({ runId: result.runId, ok: true });
  } catch (err: any) {
    console.error("[workflows/trigger POST]", err);
    return NextResponse.json({ error: err.message ?? "Trigger failed" }, { status: 500 });
  }
}