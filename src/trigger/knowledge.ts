import { task, logger } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/server";
import { scrapeWithTinyFish } from "@/lib/tinyfish";
import pLimit from "p-limit";
import pRetry from "p-retry";

const GEMINI_EMBEDDING_MODEL = "text-embedding-004";
const DEFAULT_CHUNK_TOKENS = 300;

export const processKnowledge = task({
  id: "knowledge.process",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: {
    sourceId: string;
    workspaceId: string;
    overrideChunkTokens?: number;
    usePreciseTokenizer?: boolean;
  }) => {
    const { sourceId, workspaceId, overrideChunkTokens, usePreciseTokenizer } = payload;
    const admin = await createAdminClient();

    // Helper to update status
    const updateStatus = async (status: string, extra: any = {}) => {
      await admin.from("knowledge_sources").update({ status, ...extra }).eq("id", sourceId);
    };

    const { data: source, error: srcErr } = await admin
      .from("knowledge_sources")
      .select("*")
      .eq("id", sourceId)
      .eq("workspace_id", workspaceId)
      .single();

    if (srcErr || !source) {
      logger.error("Source not found", { sourceId, error: srcErr });
      return;
    }

    await updateStatus("extracting");

    try {
      let textContent = "";

      // ── Download and extract text ─────────────────────────────────────────
      if (["pdf", "docx", "txt", "csv", "xlsx", "md"].includes(source.type)) {
        const { data: fileData, error: downloadError } = await admin.storage
          .from("knowledge-files")
          .download(source.file_path);

        if (downloadError || !fileData) throw new Error("Could not download file from storage");

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (source.type === "pdf") {
          const pdfParse = require("pdf-parse");
          const result = await pdfParse(buffer);
          textContent = result?.text || "";
        } else if (source.type === "docx") {
          const mammoth = require("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          textContent = result?.value || "";
        } else if (source.type === "csv") {
          const { parse } = require("csv-parse/sync");
          const text = new TextDecoder("utf-8").decode(arrayBuffer);
          const records = parse(text, { skip_empty_lines: true });
          if (records.length > 0) {
            const headers = records[0];
            const lines = [headers.join(" | ")];
            for (let i = 1; i < records.length; i++) {
              lines.push(headers.map((h: string, j: number) => `${h}: ${records[i][j] ?? ""}`).join(" | "));
            }
            textContent = lines.join("\n");
          }
        } else if (source.type === "xlsx") {
          const XLSX = require("xlsx");
          const workbook = XLSX.read(buffer, { type: "buffer" });
          const lines: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) {
              lines.push(`=== Sheet: ${sheetName} ===\n${csv}`); // Can further use csv-parse if needed
            }
          }
          textContent = lines.join("\n\n");
        } else {
          // txt, md
          textContent = new TextDecoder("utf-8").decode(arrayBuffer);
        }
      } else if (source.type === "website") {
        textContent = await scrapeWithTinyFish(source.source_url);
      } else if (source.type === "google_sheet") {
        const useServiceAccount =
          source.metadata?.useServiceAccount === true || usePreciseTokenizer === true;
        textContent = await fetchGoogleSheet(source.source_url, useServiceAccount, source.metadata?.sheetRange);
      } else if (source.metadata?.raw_content) {
        textContent = source.metadata.raw_content;
      }

      if (!textContent || textContent.trim().length < 10) {
        throw new Error("Extracted content is too short or empty");
      }

      // ── Chunking ────────────────────────────────────────────────────────
      await updateStatus("chunking");
      const chunkTokens = overrideChunkTokens && overrideChunkTokens > 0 ? overrideChunkTokens : DEFAULT_CHUNK_TOKENS;
      const preciseMode = usePreciseTokenizer === true || source.metadata?.usePreciseTokenizer === true;
      const overlapTokens = Math.floor(chunkTokens * 0.15); // 15% overlap

      const chunks = chunkTextByTokens(textContent, chunkTokens, overlapTokens, preciseMode);
      if (chunks.length === 0) throw new Error("No chunks produced from content");

      // Delete old chunks for this source
      await admin.from("knowledge_chunks").delete().eq("source_id", sourceId);

      // ── Embedding ───────────────────────────────────────────────────────
      await updateStatus("embedding");
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

      const limit = pLimit(5); // 5 concurrent Gemini requests at a time
      let totalChunks = 0;

      const processChunk = async (chunk: string, index: number) => {
        return pRetry(async () => {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: `models/${GEMINI_EMBEDDING_MODEL}`,
                content: { parts: [{ text: chunk.slice(0, 8000) }] },
                taskType: "RETRIEVAL_DOCUMENT",
              }),
            }
          );

          if (res.status === 429) throw new Error("Rate limit exceeded");
          if (!res.ok) throw new Error(`API error: ${res.status}`);

          const data = await res.json();
          if (!data.embedding?.values) throw new Error("No embedding returned");
          
          return { chunk, index, embedding: data.embedding.values };
        }, {
          retries: 4,
          minTimeout: 1000,
          maxTimeout: 10000,
        });
      };

      const promises = chunks.map((chunk, index) =>
        limit(async () => {
          try {
            return await processChunk(chunk, index);
          } catch (e) {
            logger.error("Failed to embed chunk", { index, error: e });
            return null;
          }
        })
      );

      const results = await Promise.all(promises);
      const validResults = results.filter((r) => r !== null) as { chunk: string; index: number; embedding: number[] }[];

      // ── Saving ──────────────────────────────────────────────────────────
      await updateStatus("saving");
      for (let i = 0; i < validResults.length; i += 50) {
        const batch = validResults.slice(i, i + 50);
        const rows = batch.map((r) => ({
          source_id: sourceId,
          workspace_id: workspaceId,
          content: r.chunk,
          embedding: r.embedding,
          chunk_index: r.index,
          metadata: {
            source_name: source.name,
            source_type: source.type,
            source_url: source.source_url ?? null,
            chunk_tokens: chunkTokens,
            precise_mode: preciseMode,
          },
        }));

        const { error: insertErr } = await admin.from("knowledge_chunks").insert(rows);
        if (insertErr) {
          logger.error("Failed to insert chunk batch", { error: insertErr });
        } else {
          totalChunks += rows.length;
        }
      }

      await updateStatus("ready", {
        total_chunks: totalChunks,
        last_synced_at: new Date().toISOString(),
        metadata: {
          ...source.metadata,
          content_length: textContent.length,
          chunk_tokens: chunkTokens,
          precise_mode: preciseMode,
        },
      });

      logger.info(`Successfully processed knowledge source ${sourceId}`, { chunks: totalChunks });

    } catch (procErr: any) {
      logger.error("Processing failed", { error: procErr });
      await updateStatus("error", { error_message: procErr.message ?? "Processing failed" });
      throw procErr;
    }
  },
});

// ── Google Sheets Helper ───────────────────────────────────────────────────────
async function fetchGoogleSheet(sheetUrl: string, useServiceAccount: boolean, range?: string): Promise<string> {
  const sheetId = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!sheetId) throw new Error("Unable to parse Google Sheet ID");
  const gid = sheetUrl.match(/[#&?]gid=(\d+)/)?.[1];

  if (!useServiceAccount) {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (gid) csvUrl += `&gid=${gid}`;
    const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) throw new Error(`Failed to fetch public Google Sheet (${resp.status}).`);
    const { parse } = require("csv-parse/sync");
    const records = parse(await resp.text(), { skip_empty_lines: true });
    if (!records.length) return "";
    const headers = records[0];
    const lines = [headers.join(" | ")];
    for (let i = 1; i < records.length; i++) {
      lines.push(headers.map((h: string, j: number) => `${h}: ${records[i][j] ?? ""}`).join(" | "));
    }
    return lines.join("\n");
  }

  // Service Account Auth logic
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured.");
  const sa = JSON.parse(saJson);
  
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const sigInput = `${jwtHeader}.${jwtClaim}`;
  const pemBody = (sa.private_key as string).replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sigBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(sigInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${sigInput}.${sig}`,
  });
  if (!tokenRes.ok) throw new Error("Failed to get Google OAuth token for service account.");
  
  const { access_token } = await tokenRes.json();
  const apiRange = range ?? "A1:ZZ10000";
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(apiRange)}?majorDimension=ROWS`;
  
  const authResp = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!authResp.ok) throw new Error(`Failed to fetch Google Sheet (${authResp.status}).`);
  
  const data = await authResp.json();
  const rows = data.values ?? [];
  if (rows.length === 0) return "";
  
  const headers = rows[0];
  const lines = [headers.join(" | ")];
  for (let r = 1; r < rows.length; r++) {
    lines.push(headers.map((h: string, i: number) => `${h}: ${rows[r][i] ?? ""}`).join(" | "));
  }
  return lines.join("\n");
}

// ── Token-aware chunking ──────────────────────────────────────────────────────
function chunkTextByTokens(text: string, targetTokens: number, overlapTokens: number, preciseMode: boolean): string[] {
  if (!text.trim()) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const targetWords = Math.max(10, Math.floor(targetTokens / 1.3));
  const overlapWords = Math.max(0, Math.floor(overlapTokens / 1.3));
  const chunks: string[] = [];

  if (!preciseMode) {
    let i = 0;
    while (i < words.length) {
      const slice = words.slice(i, i + targetWords);
      if (slice.length > 0) chunks.push(slice.join(" "));
      i += targetWords - overlapWords;
      if (i <= 0) break;
    }
  } else {
    const paragraphs = text.split(/\n{2,}/);
    let buffer: string[] = [];
    const flush = () => {
      if (buffer.length > 0) {
        chunks.push(buffer.join(" "));
        buffer = buffer.slice(Math.max(0, buffer.length - overlapWords));
      }
    };
    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const sentences = para.match(/[^.!?\n]+[.!?\n]*|\S+/g) ?? [para];
      for (const sentence of sentences) {
        const sentWords = sentence.trim().split(/\s+/).filter(Boolean);
        if (buffer.length + sentWords.length > targetWords && buffer.length > 0) flush();
        buffer.push(...sentWords);
      }
      if (buffer.length >= targetWords * 0.75) flush();
    }
    flush();
  }
  return chunks.filter((c) => c.split(/\s+/).length >= 5);
}
