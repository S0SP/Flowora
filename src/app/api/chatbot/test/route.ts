import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { generateRagResponse } from "@/services/rag";

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const {
      message,
      history = [],
      prompt,
      api_key,
      is_lead_tool_enabled,
      is_store_tool_enabled,
    } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const admin = await createAdminClient();

    // Load chatbot settings
    const { data: settings } = await admin
      .from("chatbot_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    const apiKey = api_key || settings?.gemini_api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API Key is required to test the chatbot." }, { status: 400 });
    }

    const systemPersona = prompt || settings?.persona || "You are a helpful AI assistant.";
    const fallbackMessage = settings?.fallback_message || "I'm sorry, I can't help with that right now.";

    // Build chat history
    const prunedHistory = (history as Array<{ sender: string; text: string }>)
      .slice(-10)
      .map(m => ({
        role: m.sender === "user" ? "user" as const : "model" as const,
        text: m.text,
      }));

    // Use RAG if knowledge base enabled
    if (settings?.use_knowledge_base !== false) {
      const { reply } = await generateRagResponse({
        query: message,
        workspaceId,
        chatHistory: prunedHistory,
        systemPersona,
        fallbackMessage,
        apiKey,
        maxTokens: 1024,
        temperature: settings?.temperature ?? 0.7,
      });
      return NextResponse.json({ reply });
    }

    // Direct Gemini call (no RAG) with optional tools
    const chatHistory = [
      ...prunedHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: "user", parts: [{ text: message }] },
    ];

    const functionDeclarations: any[] = [];
    if (is_lead_tool_enabled) {
      functionDeclarations.push({
        name: "check_lead_status",
        description: "Check lead or booking status by email or phone.",
        parameters: {
          type: "OBJECT",
          properties: {
            email_or_phone: { type: "STRING", description: "Email or phone to look up." },
          },
          required: ["email_or_phone"],
        },
      });
    }
    if (is_store_tool_enabled) {
      functionDeclarations.push({
        name: "get_store_products",
        description: "Retrieve product catalog.",
        parameters: { type: "OBJECT", properties: {} },
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiPayload: Record<string, any> = {
      contents: chatHistory,
      generationConfig: { maxOutputTokens: 1024, temperature: settings?.temperature ?? 0.7 },
      systemInstruction: { parts: [{ text: systemPersona }] },
    };
    if (functionDeclarations.length > 0) {
      apiPayload.tools = [{ functionDeclarations }];
    }

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiPayload),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error?.message || "Gemini API failed");

    let reply = "";
    const firstPart = result.candidates?.[0]?.content?.parts?.[0];

    if (firstPart?.functionCall) {
      const { name: funcName, args } = firstPart.functionCall;
      let functionResponseData: any = {};

      if (funcName === "check_lead_status") {
        const lookup = args.email_or_phone?.trim();
        const { data: leadData } = await admin
          .from("lead_capture_leads")
          .select("name, email, phone, status, created_at")
          .or(`email.eq.${lookup},phone.eq.${lookup}`)
          .limit(1);

        functionResponseData = leadData?.[0]
          ? { found: true, ...leadData[0] }
          : { found: false, message: `No records found for "${lookup}".` };
      } else if (funcName === "get_store_products") {
        functionResponseData = { message: "Product catalog not configured. Please add products to the knowledge base." };
      }

      const followUpRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            ...chatHistory,
            { role: "model", parts: [{ functionCall: { name: funcName, args } }] },
            { role: "function", parts: [{ functionResponse: { name: funcName, response: { output: functionResponseData } } }] },
          ],
          generationConfig: apiPayload.generationConfig,
          systemInstruction: apiPayload.systemInstruction,
        }),
      });

      if (!followUpRes.ok) throw new Error("Tool callback failed");
      const followUp = await followUpRes.json();
      reply = (followUp.candidates?.[0]?.content?.parts ?? [])
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text ?? "")
        .join("")
        .trim();
    } else {
      reply = (result.candidates?.[0]?.content?.parts ?? [])
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text ?? "")
        .join("")
        .trim();
    }

    if (!reply) throw new Error("No response generated.");

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[chatbot/test]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test failed" },
      { status: 500 }
    );
  }
}
