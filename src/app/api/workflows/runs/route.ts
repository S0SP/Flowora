import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// GET /api/workflows/runs?workflowId=xxx
export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const workflowId = req.nextUrl.searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Fetch runs with their steps from the real workflow_run_steps table
    const { data: runs, error } = await admin
      .from("workflow_runs")
      .select("*, workflow_run_steps(id, node_id, node_type, status, input, output, created_at)")
      .eq("workspace_id", workspaceId)
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const formattedRuns = runs?.map((r: any) => {
      // Build steps_log from workflow_run_steps (real table) first,
      // falling back to context.steps_log (legacy JSONB array) if steps table is empty
      const dbSteps: any[] = (r.workflow_run_steps ?? [])
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((s: any) => ({
          nodeId:     s.node_id,
          nodeType:   s.node_type,
          executedAt: s.created_at,
          result:     s.output,
          nextNodes:  [],
        }))

      const stepsLog = dbSteps.length > 0 ? dbSteps : (r.context?.steps_log ?? [])

      return {
        ...r,
        created_at:      r.started_at,
        completed_at:    r.finished_at,
        trigger_type:    r.context?.trigger_type,
        trigger_data:    r.context?.trigger_data,
        steps_total:     r.context?.steps_total ?? stepsLog.length,
        steps_completed: stepsLog.length,
        error_message:   r.context?.error_message,
        // Always include full steps log for the UI trace view
        context: {
          ...(r.context ?? {}),
          steps_log: stepsLog,
        },
      }
    })

    return NextResponse.json({ runs: formattedRuns ?? [] });
  } catch (err: any) {
    const status = err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: err.message ?? "Failed to fetch runs" }, { status });
  }
}
