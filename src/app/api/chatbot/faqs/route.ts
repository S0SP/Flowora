import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// GET — list FAQ entries
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data: faqs, error } = await admin
      .from("chatbot_faqs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ faqs: faqs ?? [] });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch FAQs" }, { status: 500 });
  }
}

// POST — create/update FAQ
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { id, question, answer, match_type = "contains", priority = 0, is_active = true } = body;

    if (!question || !answer) {
      return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
    }

    const admin = await createAdminClient();

    const upsertData = {
      workspace_id: workspaceId,
      question: question.trim(),
      answer: answer.trim(),
      match_type,
      priority,
      is_active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      const { data, error } = await admin
        .from("chatbot_faqs")
        .update(upsertData)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await admin
        .from("chatbot_faqs")
        .insert(upsertData)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ faq: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove FAQ
export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const admin = await createAdminClient();
    await admin.from("chatbot_faqs").delete().eq("id", id).eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
