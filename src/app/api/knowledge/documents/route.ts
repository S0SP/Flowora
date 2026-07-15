import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const runtime = "nodejs";

// GET — list all knowledge sources for workspace
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data: sources, error } = await admin
      .from("knowledge_sources")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Get chunk counts per source
    const { data: chunkCounts } = await admin
      .from("knowledge_chunks")
      .select("source_id")
      .eq("workspace_id", workspaceId);

    const countMap = (chunkCounts ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.source_id] = (acc[r.source_id] ?? 0) + 1;
      return acc;
    }, {});

    const enriched = (sources ?? []).map(s => ({
      ...s,
      chunk_count: countMap[s.id] ?? 0,
    }));

    return NextResponse.json({ sources: enriched });
  } catch (err) {
    console.error("[knowledge/documents GET]", err);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}

// POST — add a URL / text source
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { name, type, source_url, content } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name and type are required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const { data: source, error } = await admin
      .from("knowledge_sources")
      .insert({
        workspace_id: workspaceId,
        name,
        type,
        source_url: source_url ?? null,
        status: "pending",
        metadata: { raw_content: content ?? null },
      })
      .select()
      .single();

    if (error) throw error;

    // Trigger background processing
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${proto}://${host}`;

    fetch(`${baseUrl}/api/knowledge/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass workspaceId directly since this is a server-to-server call
        "x-internal-workspace-id": workspaceId,
      },
      body: JSON.stringify({ sourceId: source.id, workspaceId }),
    }).catch(e => console.error("[knowledge process trigger]", e));

    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    console.error("[knowledge/documents POST]", err);
    return NextResponse.json({ error: "Failed to add source" }, { status: 500 });
  }
}

// DELETE — remove a knowledge source (and all its chunks)
export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    // Chunks cascade delete via FK, but let's be explicit
    await admin.from("knowledge_chunks").delete().eq("source_id", id).eq("workspace_id", workspaceId);
    await admin.from("knowledge_sources").delete().eq("id", id).eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[knowledge/documents DELETE]", err);
    return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
  }
}
