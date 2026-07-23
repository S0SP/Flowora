import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// GET /api/workflows/runs?workflowId=xxx
export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const workflowId = req.nextUrl.searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
    }

    const admin = await createAdminClient();

    const { data: runs, error } = await admin
      .from("workflow_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workflow_id", workflowId)
      .order("started_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const formattedRuns = runs?.map((r: any) => ({
      ...r,
      created_at: r.started_at,
      completed_at: r.finished_at,
      trigger_type: r.context?.trigger_type,
      trigger_data: r.context?.trigger_data,
      steps_total: r.context?.steps_total,
      steps_completed: r.context?.steps_completed,
      error_message: r.context?.error_message,
    }))

    return NextResponse.json({ runs: formattedRuns ?? [] });
  } catch (err: any) {
    const status = err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: err.message ?? "Failed to fetch runs" }, { status });
  }
}
