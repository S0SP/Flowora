import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateRagResponse } from "@/services/rag";

// Helper to check FAQ matching
async function checkFAQ(userMessage: string, workspaceId: string, supabase: any) {
  try {
    const { data: faqs } = await supabase
      .from("chatbot_faqs")
      .select("question, answer, match_type")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (!faqs || faqs.length === 0) return null;

    const userLower = userMessage.toLowerCase().trim();

    for (const faq of faqs) {
      const qLower = faq.question.toLowerCase().trim();
      let matched = false;

      switch (faq.match_type) {
        case "exact":
          matched = userLower === qLower;
          break;
        case "starts_with":
          matched = userLower.startsWith(qLower);
          break;
        case "contains":
        default:
          matched = userLower.includes(qLower) || qLower.includes(userLower);
          break;
      }

      if (matched) return faq.answer;
    }
  } catch (err) {
    console.error("FAQ Match error:", err);
  }
  return null;
}

// GET - Retrieve messages for an existing widget thread
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get("threadId");
    if (!threadId) {
      return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ messages: messages || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST - Submit a new visitor message and generate bot reply
export async function POST(req: NextRequest) {
  try {
    const supabase = await createAdminClient();
    const body = await req.json();
    const { ws, message, threadId } = body;

    if (!ws || !message) {
      return NextResponse.json({ error: "Workspace ID and message are required" }, { status: 400 });
    }

    let activeThreadId = threadId;
    let contactId;

    // 1. If no threadId exists, create a new contact and thread
    if (!activeThreadId) {
      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          workspace_id: ws,
          name: "Web Visitor",
          source: "widget",
        })
        .select()
        .single();

      if (contactErr) throw contactErr;
      contactId = contact.id;

      const { data: thread, error: threadErr } = await supabase
        .from("threads")
        .insert({
          workspace_id: ws,
          contact_id: contactId,
          channel: "widget",
          status: "open",
          ai_active: true,
          last_message_preview: message.substring(0, 100),
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (threadErr) throw threadErr;
      activeThreadId = thread.id;
    } else {
      // Fetch thread to find contact_id
      const { data: thread } = await supabase
        .from("threads")
        .select("contact_id")
        .eq("id", activeThreadId)
        .single();
      contactId = thread?.contact_id;
    }

    // 2. Insert user message
    const { error: msgErr } = await supabase
      .from("messages")
      .insert({
        workspace_id: ws,
        thread_id: activeThreadId,
        content: message,
        sender_type: "contact",
        type: "text",
      });

    if (msgErr) throw msgErr;

    // Update thread preview
    await supabase
      .from("threads")
      .update({
        last_message_preview: message.substring(0, 100),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", activeThreadId);

    // 3. Load chatbot settings for this workspace
    const { data: chatbot } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("workspace_id", ws)
      .maybeSingle();

    // Check if chatbot is active and has widget enabled
    if (chatbot && (!chatbot.is_active || !chatbot.web_widget_enabled)) {
      return NextResponse.json({ threadId: activeThreadId, reply: null });
    }

    // 4. Try FAQ first (no LLM, zero latency)
    const faqReply = await checkFAQ(message, ws, supabase);
    if (faqReply) {
      await supabase
        .from("messages")
        .insert({
          workspace_id: ws,
          thread_id: activeThreadId,
          content: faqReply,
          sender_type: "bot",
          type: "text",
        });

      return NextResponse.json({ threadId: activeThreadId, reply: faqReply });
    }

    // 5. Generate RAG-powered reply from Gemini
    // Fetch last 10 messages for conversation context
    const { data: history } = await supabase
      .from("messages")
      .select("content, sender_type")
      .eq("thread_id", activeThreadId)
      .eq("type", "text")
      .order("created_at", { ascending: false })
      .limit(10);

    const chatHistory = (history ?? [])
      .reverse()
      .slice(0, -1) // Exclude current message
      .map((m: any) => ({
        role: (m.sender_type === "contact" ? "user" : "model") as "user" | "model",
        text: m.content ?? "",
      }));

    const persona = chatbot?.persona || "You are a helpful customer service assistant.";
    const fallback = chatbot?.fallback_message || "I'll connect you with a human agent.";
    const apiKey = chatbot?.gemini_api_key || process.env.GEMINI_API_KEY || "";

    const { reply } = await generateRagResponse({
      query: message,
      workspaceId: ws,
      chatHistory,
      systemPersona: persona,
      fallbackMessage: fallback,
      apiKey,
      maxTokens: 512,
      temperature: 0.7,
    });

    if (reply) {
      // Save bot reply
      await supabase
        .from("messages")
        .insert({
          workspace_id: ws,
          thread_id: activeThreadId,
          content: reply,
          sender_type: "bot",
          type: "text",
        });
    }

    return NextResponse.json({ threadId: activeThreadId, reply });
  } catch (err: any) {
    console.error("Chat Widget API Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
