import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createAdminClient();

    const { data: settingsList, error: getError } = await supabase
      .from("chatbot_settings")
      .select("*")
      .limit(1);

    if (getError) throw getError;
    let settings = settingsList?.[0] || null;

    // Auto-create defaults if table is empty
    if (!settings) {
      const { data: created, error: createError } = await supabase
        .from("chatbot_settings")
        .insert({
          is_enabled: false,
          system_prompt: "You are a helpful customer service AI assistant for our agency. Answer questions clearly and politely. Keep responses concise (under 3 sentences) and encourage booking a consultation call.",
          is_caching_enabled: false,
          is_lead_tool_enabled: false,
          is_store_tool_enabled: false,
        })
        .select()
        .single();

      if (createError) throw createError;
      settings = created;
    }

    // Retrieve prompt history list
    const { data: historyList } = await supabase
      .from("chatbot_prompt_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({ settings, history: historyList || [] });
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
    const body = await req.json();
    const { 
      is_enabled, 
      system_prompt, 
      gemini_api_key, 
      is_caching_enabled,
      is_lead_tool_enabled,
      is_store_tool_enabled
    } = body;

    if (is_enabled && !system_prompt) {
      return NextResponse.json({ error: "System prompt instructions are required when chatbot is active" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const { data: existing } = await supabase
      .from("chatbot_settings")
      .select("id, system_prompt")
      .limit(1);

    const oldPrompt = existing?.[0]?.system_prompt;
    if (system_prompt && system_prompt !== oldPrompt) {
      // Record historical prompt
      await supabase
        .from("chatbot_prompt_history")
        .insert({ prompt: system_prompt });
    }

    let result;

    if (existing && existing.length > 0) {
      result = await supabase
        .from("chatbot_settings")
        .update({
          is_enabled: !!is_enabled,
          system_prompt,
          gemini_api_key: gemini_api_key || null,
          is_caching_enabled: !!is_caching_enabled,
          is_lead_tool_enabled: !!is_lead_tool_enabled,
          is_store_tool_enabled: !!is_store_tool_enabled,
          cache_resource_name: null,
          cache_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("chatbot_settings")
        .insert({
          is_enabled: !!is_enabled,
          system_prompt,
          gemini_api_key: gemini_api_key || null,
          is_caching_enabled: !!is_caching_enabled,
          is_lead_tool_enabled: !!is_lead_tool_enabled,
          is_store_tool_enabled: !!is_store_tool_enabled,
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    return NextResponse.json({ success: true, settings: result.data });
  } catch (err) {
    console.error("Chatbot API POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save chatbot settings" },
      { status: 500 }
    );
  }
}
