/**
 * RAG (Retrieval-Augmented Generation) service
 * Used by both the AI chatbot and voice agent to answer questions
 * using the workspace's knowledge base.
 */

import { createAdminClient } from "@/lib/supabase/server";

const GEMINI_EMBEDDING_MODEL = "text-embedding-004";

/** Embed a single query string */
async function embedQuery(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },
          taskType: "RETRIEVAL_QUERY",
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

export interface RagResult {
  context: string;
  sources: string[];
  hasKnowledge: boolean;
}

/**
 * Retrieve relevant knowledge chunks for a given query.
 * Falls back to returning empty context if knowledge base is empty.
 */
export async function retrieveContext(
  query: string,
  workspaceId: string,
  opts: { limit?: number; threshold?: number } = {}
): Promise<RagResult> {
  const { limit = 5, threshold = 0.4 } = opts;
  const apiKey = process.env.GEMINI_API_KEY;
  const admin = await createAdminClient();

  if (!apiKey) {
    return { context: "", sources: [], hasKnowledge: false };
  }

  // Check if workspace has any ready knowledge chunks
  const { count } = await admin
    .from("knowledge_chunks")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  if (!count || count === 0) {
    return { context: "", sources: [], hasKnowledge: false };
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query, apiKey);

  let chunks: Array<{ content: string; source_id: string; similarity?: number }> = [];

  if (queryEmbedding) {
    // Vector similarity search
    const { data, error } = await admin.rpc("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      workspace_id_param: workspaceId,
      match_count: limit,
      match_threshold: threshold,
    });

    if (!error && data?.length > 0) {
      chunks = data;
    }
  }

  // Fallback: keyword search if vector search returns nothing
  if (chunks.length === 0) {
    const keywords = query.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    if (keywords.length > 0) {
      const searchPattern = keywords.join(" | ");
      const { data: kw } = await admin
        .from("knowledge_chunks")
        .select("content, source_id")
        .eq("workspace_id", workspaceId)
        .textSearch("content", searchPattern, { type: "plain" })
        .limit(limit);

      if (kw?.length) chunks = kw;
    }

    // Last resort: return most recent chunks
    if (chunks.length === 0) {
      const { data: recent } = await admin
        .from("knowledge_chunks")
        .select("content, source_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (recent) chunks = recent;
    }
  }

  if (chunks.length === 0) {
    return { context: "", sources: [], hasKnowledge: true };
  }

  // Get source names
  const sourceIds = [...new Set(chunks.map(c => c.source_id))];
  const { data: sourcesData } = await admin
    .from("knowledge_sources")
    .select("name")
    .in("id", sourceIds);

  const sources = (sourcesData ?? []).map(s => s.name);
  const context = chunks.map(c => c.content).join("\n\n---\n\n");

  return { context, sources, hasKnowledge: true };
}

/**
 * Generate an AI response using RAG context.
 * This is the core function for both chatbot and voice agent.
 */
export async function generateRagResponse(opts: {
  query: string;
  workspaceId: string;
  chatHistory?: Array<{ role: "user" | "model"; text: string }>;
  systemPersona?: string;
  fallbackMessage?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ reply: string; sources: string[] }> {
  const {
    query,
    workspaceId,
    chatHistory = [],
    systemPersona = "You are a helpful AI assistant.",
    fallbackMessage = "I'm sorry, I don't have that information. Please contact our team for help.",
    apiKey = process.env.GEMINI_API_KEY,
    maxTokens = 1024,
    temperature = 0.7,
  } = opts;

  if (!apiKey) {
    return { reply: fallbackMessage, sources: [] };
  }

  // Retrieve relevant context
  const { context, sources, hasKnowledge } = await retrieveContext(query, workspaceId, {
    limit: 5,
    threshold: 0.35,
  });

  // Build system prompt
  let systemPrompt = systemPersona;
  if (hasKnowledge && context) {
    systemPrompt += `\n\nKNOWLEDGE BASE (use this to answer questions accurately):\n${context.slice(0, 12000)}`;
    systemPrompt += `\n\nIMPORTANT: Answer using the knowledge base above. If the answer isn't there, say "${fallbackMessage}"`;
  } else if (hasKnowledge) {
    systemPrompt += `\n\nNote: The knowledge base exists but no relevant content was found for this query.`;
  }

  // Build conversation history
  const contents = [
    ...chatHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user" as const, parts: [{ text: query }] },
  ];

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      }
    );

    if (!res.ok) throw new Error("Gemini API failed");
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const reply = parts
      .filter((p: { thought?: boolean; text?: string }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    return { reply: reply || fallbackMessage, sources };
  } catch (err) {
    console.error("[rag] generateRagResponse error:", err);
    return { reply: fallbackMessage, sources: [] };
  }
}
