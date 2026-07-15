import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST — upload a file (PDF, DOCX, TXT, CSV, XLSX)
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store file in Supabase Storage
    const storagePath = `${workspaceId}/knowledge/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await admin.storage
      .from("knowledge-files")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      // If bucket doesn't exist yet, just extract text directly
      console.warn("[knowledge/upload] Storage upload failed:", uploadErr.message);
    }

    // Extract text from file
    let textContent = "";
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "txt" || ext === "md") {
      textContent = new TextDecoder().decode(arrayBuffer);
    } else if (ext === "csv") {
      textContent = parseCSV(new TextDecoder().decode(arrayBuffer));
    } else if (ext === "pdf") {
      textContent = await extractPDFText(buffer);
    } else if (ext === "docx") {
      textContent = await extractDocxText(buffer);
    } else {
      // Fallback: try to read as text
      textContent = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
    }

    if (!textContent || textContent.trim().length < 10) {
      return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
    }

    // Determine source type
    const typeMap: Record<string, string> = {
      pdf: "pdf", docx: "docx", txt: "txt", md: "txt",
      csv: "csv", xlsx: "xlsx", xls: "xlsx",
    };
    const sourceType = typeMap[ext ?? ""] ?? "txt";

    // Create knowledge source record
    const { data: source, error: srcErr } = await admin
      .from("knowledge_sources")
      .insert({
        workspace_id: workspaceId,
        name: file.name,
        type: sourceType,
        file_path: storagePath,
        status: "pending",
        metadata: { raw_content: textContent.slice(0, 100_000) }, // Store first 100k chars
      })
      .select()
      .single();

    if (srcErr) throw srcErr;

    // Trigger background processing
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${proto}://${host}`;

    fetch(`${baseUrl}/api/knowledge/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-workspace-id": workspaceId },
      body: JSON.stringify({ sourceId: source.id, workspaceId }),
    }).catch(console.error);

    return NextResponse.json({ source, preview: textContent.slice(0, 200) }, { status: 201 });
  } catch (err: any) {
    console.error("[knowledge/upload POST]", err);
    return NextResponse.json({ error: err.message ?? "Upload failed" }, { status: 500 });
  }
}

// ── Text extraction helpers ───────────────────────────────────────────────

function parseCSV(text: string): string {
  // Convert CSV to readable text by formatting as key: value pairs
  const lines = text.trim().split("\n");
  if (lines.length === 0) return text;

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return headers.map((h, i) => `${h}: ${vals[i] ?? ""}`).join(" | ");
  });

  return [headers.join(", "), ...rows].join("\n");
}

async function extractPDFText(buffer: Buffer): Promise<string> {
  try {
    // Simple regex-based PDF text extraction (no external dep)
    const text = buffer.toString("binary");
    const matches = text.match(/BT[\s\S]*?ET/g) ?? [];
    const extracted = matches
      .map(block => {
        return block
          .replace(/\/F\d+\s+\d+\s+Tf/g, " ")
          .match(/\(([^)]+)\)/g)
          ?.map(m => m.slice(1, -1))
          .join(" ") ?? "";
      })
      .join("\n");

    if (extracted.trim().length > 50) return extracted;

    // Fallback: look for text streams
    const streamMatches = text.match(/stream[\s\S]*?endstream/g) ?? [];
    return streamMatches
      .map(s => s.replace(/stream|endstream/g, "").replace(/[^\x20-\x7E\n]/g, " "))
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // DOCX is a zip file — look for word/document.xml inside
    // Simple extraction without external deps using zip signature detection
    const text = buffer.toString("binary");
    const xmlMatch = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (xmlMatch) {
      return xmlMatch
        .map(m => m.replace(/<[^>]+>/g, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return "";
  } catch {
    return "";
  }
}
