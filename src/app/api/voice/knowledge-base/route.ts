import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const flowraSecret =
      process.env.DOGRAH_SECRET ||
      process.env.DOGRAH_API_SECRET ||
      "change-me-in-production";
    const requestSecret = req.headers.get("X-Flowra-Secret");
    if (requestSecret !== flowraSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    let { query, workspaceId, phoneNumber, limit = 4 } = body;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }
    
    const admin = await createAdminClient();

    // If workspaceId is not provided, try to resolve it from the incoming phone number (inbound route)
    if (!workspaceId && phoneNumber) {
      // Find the workspace where voice connection dograhPhoneNumber matches this incoming number
      const { data: connections } = await admin
        .from("channel_connections")
        .select("workspace_id, config")
        .eq("type", "voice");

      if (connections) {
        const matchingConn = connections.find(c => {
          if (!c.config?.dograhPhoneNumber) return false;
          // Basic normalization for matching
          const normalize = (p: string) => p.replace(/\D/g, "");
          return normalize(c.config.dograhPhoneNumber) === normalize(phoneNumber);
        });
        
        if (matchingConn) {
          workspaceId = matchingConn.workspace_id;
        }
      }
    }

    if (!workspaceId) {
       return NextResponse.json({ error: "workspaceId or mapped phoneNumber is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    // 1. Embed query using Google text-embedding-004
    const embeddingRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: query }] },
          taskType: "RETRIEVAL_QUERY",
        }),
      }
    );

    if (!embeddingRes.ok) {
      throw new Error("Failed to embed query");
    }

    const embeddingData = await embeddingRes.json();
    const queryEmbedding = embeddingData.embedding?.values;

    if (!queryEmbedding) {
      throw new Error("No embedding returned");
    }

    // 2. Query similarity on public.knowledge_chunks
    const { data: chunks, error: matchErr } = await admin.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      workspace_id_param: workspaceId,
      match_count: limit,
      match_threshold: 0.3, // Lower threshold for voice context matching
    });

    if (matchErr) {
      throw matchErr;
    }

    // Get source documents for filenames
    const sourceIds = [...new Set((chunks || []).map((c: any) => c.source_id))];
    let sourceMap: Record<string, string> = {};
    if (sourceIds.length > 0) {
      const { data: sources } = await admin
        .from("knowledge_sources")
        .select("id, name")
        .in("id", sourceIds);
      if (sources) {
        sources.forEach((s: any) => {
          sourceMap[s.id] = s.name;
        });
      }
    }

    return NextResponse.json({
      chunks: (chunks || []).map((c: any, index: number) => ({
        text: c.content,
        filename: sourceMap[c.source_id] || "knowledge_base_document",
        similarity: c.similarity,
        chunk_index: index,
      })),
    });
  } catch (err: any) {
    console.error("Voice KB Search Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
