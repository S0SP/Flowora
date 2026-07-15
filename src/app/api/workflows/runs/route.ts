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
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ runs: runs ?? [] });
  } catch (err: any) {
    const status = err?.status === 401 ? 401 : 500;
    return NextResponse.json({ error: err.message ?? "Failed to fetch runs" }, { status });
  }
}
