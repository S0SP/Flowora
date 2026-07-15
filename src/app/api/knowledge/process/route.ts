import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for large docs

const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
const CHUNK_SIZE = 800;  // characters per chunk
const CHUNK_OVERLAP = 100;

// Entry point — called internally after a source is added
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceId, workspaceId } = body;

    if (!sourceId || !workspaceId) {
      return NextResponse.json({ error: "sourceId and workspaceId required" }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Fetch source record
    const { data: source, error: srcErr } = await admin
      .from("knowledge_sources")
      .select("*")
      .eq("id", sourceId)
      .eq("workspace_id", workspaceId)
      .single();

    if (srcErr || !source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Mark as processing
    await admin.from("knowledge_sources").update({ status: "processing" }).eq("id", sourceId);

    try {
      let textContent = "";

      // Extract content based on type
      if (source.type === "website") {
        textContent = await scrapeWebsite(source.source_url);
      } else if (source.metadata?.raw_content) {
        textContent = source.metadata.raw_content;
      } else {
        throw new Error("No content to process");
      }

      if (!textContent || textContent.trim().length < 10) {
        throw new Error("Extracted content is too short or empty");
      }

      // Chunk the text
      const chunks = chunkText(textContent, CHUNK_SIZE, CHUNK_OVERLAP);

      // Get Gemini API key
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

      // Delete old chunks for this source
      await admin.from("knowledge_chunks").delete().eq("source_id", sourceId);

      // Embed and insert in batches of 10
      let totalChunks = 0;
      const batchSize = 10;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await embedTexts(batch, geminiKey);

        const rows = batch.map((chunk, idx) => ({
          source_id: sourceId,
          workspace_id: workspaceId,
          content: chunk,
          embedding: embeddings[idx],
          chunk_index: i + idx,
          metadata: {
            source_name: source.name,
            source_type: source.type,
            source_url: source.source_url,
          },
        }));

        const { error: insertErr } = await admin.from("knowledge_chunks").insert(rows);
        if (insertErr) {
          console.error("[knowledge process] insert error:", insertErr);
        } else {
          totalChunks += batch.length;
        }
      }

      // Mark source as ready
      await admin.from("knowledge_sources").update({
        status: "ready",
        total_chunks: totalChunks,
        last_synced_at: new Date().toISOString(),
        metadata: {
          ...source.metadata,
          content_length: textContent.length,
        },
      }).eq("id", sourceId);

      return NextResponse.json({ ok: true, chunks: totalChunks });
    } catch (procErr: any) {
      console.error("[knowledge process] error:", procErr);
      await admin.from("knowledge_sources").update({
        status: "error",
        error_message: procErr.message ?? "Processing failed",
      }).eq("id", sourceId);
      return NextResponse.json({ error: procErr.message }, { status: 500 });
    }
  } catch (err) {
    console.error("[knowledge/process POST]", err);
    return NextResponse.json({ error: "Failed to process source" }, { status: 500 });
  }
}

// ── Web scraping ───────────────────────────────────────────────────────────
async function scrapeWebsite(url: string): Promise<string> {
  if (!url) throw new Error("No URL provided");

  // Normalize URL
  const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

  const res = await fetch(normalizedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Flowora/1.0; +https://flowora.io)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Failed to fetch ${normalizedUrl}: ${res.status}`);

  const html = await res.text();
  return extractTextFromHtml(html);
}

function extractTextFromHtml(html: string): string {
  // Remove script, style, head, nav, footer, header blocks
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    // Replace block elements with newlines
    .replace(/<(p|div|h[1-6]|li|td|th|section|article|blockquote|br)[^>]*>/gi, "\n")
    // Remove remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}

// ── Text chunking ─────────────────────────────────────────────────────────
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = "";

  for (const para of paragraphs) {
    if (!para.trim()) continue;

    if ((current + "\n\n" + para).length <= chunkSize) {
      current = current ? current + "\n\n" + para : para;
    } else {
      if (current) {
        chunks.push(current.trim());
        // Keep overlap
        const words = current.split(" ");
        current = words.slice(-Math.floor(overlap / 5)).join(" ") + "\n\n" + para;
      } else {
        // Single paragraph larger than chunkSize — split by sentences
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        let sentBuf = "";
        for (const s of sentences) {
          if ((sentBuf + " " + s).length <= chunkSize) {
            sentBuf = sentBuf ? sentBuf + " " + s : s;
          } else {
            if (sentBuf) chunks.push(sentBuf.trim());
            sentBuf = s;
          }
        }
        if (sentBuf) current = sentBuf;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.filter(c => c.length > 20);
}

// ── Gemini embeddings ─────────────────────────────────────────────────────
async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = [];

  for (const text of texts) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            content: { parts: [{ text: text.slice(0, 8000) }] },
            taskType: "RETRIEVAL_DOCUMENT",
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("[embed error]", errData);
        results.push(new Array(768).fill(0));
        continue;
      }

      const data = await res.json();
      results.push(data.embedding?.values ?? new Array(768).fill(0));
    } catch (e) {
      console.error("[embed single error]", e);
      results.push(new Array(768).fill(0));
    }

    // Slight delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

// Export helpers for reuse in other routes
export { embedTexts, scrapeWebsite, chunkText };
