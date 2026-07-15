import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const supabase = await createAdminClient();

    // 1. Fetch settings for this workspace
    let { data: settings, error: getError } = await supabase
      .from("chatbot_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (getError) throw getError;

    // Auto-create defaults if table is empty for this workspace
    if (!settings) {
      const { data: created, error: createError } = await supabase
        .from("chatbot_settings")
        .insert({
          workspace_id: workspaceId,
          is_active: false,
          bot_name: "Aria",
          persona: "You are Aria, a friendly and professional AI assistant. You help customers with product inquiries, pricing, demos, and support. Always be concise, warm, and solution-focused.",
          language: "auto",
          response_length: 65,
          fallback_message: "I'm sorry, I can't help with that right now. Let me connect you with a human agent.",
          use_knowledge_base: true,
          whatsapp_enabled: true,
          web_widget_enabled: false,
        })
        .select()
        .single();

      if (createError) throw createError;
      settings = created;
    }

    // 2. Fetch widget styling settings from workspace_settings
    const { data: wsSettings } = await supabase
      .from("workspace_settings")
      .select("chat_widget")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    // 3. Retrieve prompt history list
    const { data: historyList } = await supabase
      .from("chatbot_prompt_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      settings: {
        botName: settings.bot_name ?? "Aria",
        persona: settings.persona ?? "",
        language: settings.language ?? "auto",
        responseLength: settings.response_length ?? 65,
        fallback: settings.fallback_message ?? "",
        useKnowledgeBase: settings.use_knowledge_base ?? true,
        isActive: settings.is_active ?? false,
        whatsappEnabled: settings.whatsapp_enabled ?? true,
        webWidgetEnabled: settings.web_widget_enabled ?? false,
      },
      chatWidget: wsSettings?.chat_widget ?? {},
      history: historyList || [],
    });
  } catch (err) {
    console.error("Chatbot API GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load chatbot settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const supabase = await createAdminClient();
    const body = await req.json();

    const {
      botName,
      persona,
      language,
      responseLength,
      fallback,
      useKnowledgeBase,
      isActive,
      whatsappEnabled,
      webWidgetEnabled,
      chatWidget,
    } = body;

    // Fetch existing settings
    const { data: existing } = await supabase
      .from("chatbot_settings")
      .select("id, persona")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const oldPersona = existing?.persona;
    if (persona && persona !== oldPersona) {
      // Record historical prompt
      await supabase
        .from("chatbot_prompt_history")
        .insert({ prompt: persona });
    }

    const payload = {
      bot_name: botName,
      persona,
      language,
      response_length: responseLength !== undefined ? Number(responseLength) : 65,
      fallback_message: fallback,
      use_knowledge_base: !!useKnowledgeBase,
      is_active: isActive !== undefined ? !!isActive : false,
      whatsapp_enabled: whatsappEnabled !== undefined ? !!whatsappEnabled : true,
      web_widget_enabled: webWidgetEnabled !== undefined ? !!webWidgetEnabled : false,
      updated_at: new Date().toISOString(),
    };

    let result;

    if (existing) {
      result = await supabase
        .from("chatbot_settings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("chatbot_settings")
        .insert({
          workspace_id: workspaceId,
          ...payload,
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    // Update widget styling settings in workspace_settings if provided
    if (chatWidget) {
      const { error: wsError } = await supabase
        .from("workspace_settings")
        .upsert({
          workspace_id: workspaceId,
          chat_widget: chatWidget,
        }, {
          onConflict: "workspace_id",
        });

      if (wsError) throw wsError;
    }

    return NextResponse.json({ success: true, settings: result.data });
  } catch (err) {
    console.error("Chatbot API POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save chatbot settings" },
      { status: 500 }
    );
  }
}
