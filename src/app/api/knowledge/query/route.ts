import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const runtime = "nodejs";

// POST — run a RAG query against the knowledge base
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { query, limit = 5, threshold = 0.5 } = body;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 });
    }

    // 1. Embed the query
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

    // 2. Search for similar chunks using pgvector
    const admin = await createAdminClient();
    const { data: chunks, error: matchErr } = await admin.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      workspace_id_param: workspaceId,
      match_count: limit,
      match_threshold: threshold,
    });

    if (matchErr) {
      console.error("[knowledge/query] match error:", matchErr);
      // Fallback: return recent chunks if pgvector fails
      const { data: fallbackChunks } = await admin
        .from("knowledge_chunks")
        .select("id, source_id, content, metadata")
        .eq("workspace_id", workspaceId)
        .limit(limit);

      if (!fallbackChunks?.length) {
        return NextResponse.json({
          answer: "No knowledge base content found. Please add some sources first.",
          sources: [],
          chunks: [],
          confidence: 0,
        });
      }

      const context = fallbackChunks.map(c => c.content).join("\n\n---\n\n");
      const answer = await generateAnswer(query, context, apiKey);
      return NextResponse.json({ answer, sources: [], chunks: fallbackChunks, confidence: 0.5 });
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find relevant information in the knowledge base for this query.",
        sources: [],
        chunks: [],
        confidence: 0,
      });
    }

    // 3. Build context from matched chunks
    const context = chunks.map((c: any) => c.content).join("\n\n---\n\n");
    const avgSimilarity = chunks.reduce((s: number, c: any) => s + (c.similarity ?? 0), 0) / chunks.length;

    // 4. Get source names for attribution
    const sourceIds = [...new Set(chunks.map((c: any) => c.source_id))];
    const { data: sourcesData } = await admin
      .from("knowledge_sources")
      .select("id, name, type, source_url")
      .in("id", sourceIds);

    // 5. Generate answer with Gemini
    const answer = await generateAnswer(query, context, apiKey);

    return NextResponse.json({
      answer,
      sources: sourcesData ?? [],
      chunks: chunks.slice(0, 3), // Return top 3 chunks for transparency
      confidence: Math.round(avgSimilarity * 100),
    });
  } catch (err: any) {
    console.error("[knowledge/query POST]", err);
    return NextResponse.json({ error: err.message ?? "Query failed" }, { status: 500 });
  }
}

async function generateAnswer(query: string, context: string, apiKey: string): Promise<string> {
  const systemPrompt = `You are a helpful AI assistant. Answer the user's question using ONLY the provided context below.
If the answer is not in the context, say "I don't have that information in my knowledge base."
Be concise, accurate, and helpful.

CONTEXT:
${context.slice(0, 12000)}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
      }),
    }
  );

  if (!res.ok) throw new Error("Gemini generation failed");
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.filter((p: any) => !p.thought).map((p: any) => p.text ?? "").join("").trim();
}
