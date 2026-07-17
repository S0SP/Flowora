import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { tasks } from "@trigger.dev/sdk/v3";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min for large files

// ── Next.js route segment config for 100 MB uploads ─────────────────────────
export const config = {
  api: {
    bodyParser: false, // We handle the stream ourselves via formData()
    responseLimit: "100mb",
  },
};

// POST — upload a file (PDF, DOCX, TXT, CSV, XLSX) up to 100 MB
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const overrideChunkTokens = formData.get("overrideChunkTokens");
    const usePreciseTokenizerRaw = formData.get("usePreciseTokenizer");
    const chunkTokensNum =
      overrideChunkTokens && Number(overrideChunkTokens) > 0
        ? Number(overrideChunkTokens)
        : undefined;
    const usePreciseTokenizer = usePreciseTokenizerRaw === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 100 MB check (formData size isn't enforced by Next.js, so check manually)
    const MAX_BYTES = 100 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum allowed size is 100 MB.` },
        { status: 413 }
      );
    }

    const admin = await createAdminClient();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Store file in Supabase Storage (best-effort, don't fail if bucket missing)
    const storagePath = `${workspaceId}/knowledge/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await admin.storage
      .from("knowledge-files")
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.warn("[knowledge/upload] Storage upload failed:", uploadErr.message);
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const typeMap: Record<string, string> = {
      pdf: "pdf",
      docx: "docx",
      txt: "txt",
      md: "txt",
      csv: "csv",
      xlsx: "xlsx",
      xls: "xlsx",
    };
    const sourceType = typeMap[ext] ?? "txt";

    // Create knowledge source record
    const { data: source, error: srcErr } = await admin
      .from("knowledge_sources")
      .insert({
        workspace_id: workspaceId,
        name: file.name,
        type: sourceType,
        file_path: storagePath,
        status: "pending",
        metadata: {
          usePreciseTokenizer,
          overrideChunkTokens: chunkTokensNum ?? null,
          file_size_bytes: file.size,
          original_name: file.name,
        },
      })
      .select()
      .single();

    if (srcErr) throw srcErr;

    // Trigger background processing using Trigger.dev
    await tasks.trigger("knowledge.process", {
      sourceId: source.id,
      workspaceId,
      overrideChunkTokens: chunkTokensNum,
      usePreciseTokenizer,
    });

    return NextResponse.json(
      { source, preview: "Preview will be available once processing completes." },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[knowledge/upload POST]", err);
    return NextResponse.json(
      { error: err.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}
