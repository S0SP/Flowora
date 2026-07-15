import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// GET — list all workflows or get a single workflow
export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const admin = await createAdminClient();

    if (id) {
      const { data: workflow, error } = await admin
        .from("workflows")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return NextResponse.json({ workflow });
    }

    const { data: workflows, error } = await admin
      .from("workflows")
      .select("id, name, description, status, trigger_type, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ workflows: workflows ?? [] });
  } catch (err) {
    console.error("[workflows GET]", err);
    return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 });
  }
}

// POST — save/upsert a workflow
export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId } = await getTenant();
    const body = await req.json();
    const { id, name, nodes, edges, status } = body;

    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const admin = await createAdminClient();

    // Extract trigger info from nodes
    const triggerNode = nodes?.find((n: any) => n.type === "trigger" || n.data?.type === "trigger");
    const triggerType = triggerNode?.data?.triggerType ?? triggerNode?.data?.subtype ?? "manual";

    const upsertData = {
      workspace_id: workspaceId,
      name,
      description: body.description ?? null,
      nodes: nodes ?? [],
      edges: edges ?? [],
      status: status ?? "draft",
      trigger_type: triggerType,
      trigger_config: triggerNode?.data ?? {},
      created_by: userId,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      // Update existing
      const { data, error } = await admin
        .from("workflows")
        .update(upsertData)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await admin
        .from("workflows")
        .insert(upsertData)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ workflow: result }, { status: id ? 200 : 201 });
  } catch (err) {
    console.error("[workflows POST]", err);
    return NextResponse.json({ error: "Failed to save workflow" }, { status: 500 });
  }
}

// PATCH — activate/deactivate workflow
export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { id, status } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    const { data, error } = await admin
      .from("workflows")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    // If activating, start the workflow trigger (for Google Sheet polling)
    if (status === "active") {
      const host = req.headers.get("host") ?? "localhost:3000";
      const proto = host.startsWith("localhost") ? "http" : "https";
      fetch(`${proto}://${host}/api/workflows/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: id, workspaceId }),
      }).catch(console.error);
    }

    return NextResponse.json({ workflow: data });
  } catch (err) {
    console.error("[workflows PATCH]", err);
    return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
  }
}

// DELETE — delete a workflow
export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    await admin.from("workflows").delete().eq("id", id).eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[workflows DELETE]", err);
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }
}
