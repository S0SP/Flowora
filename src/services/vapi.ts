import { createAdminClient } from "@/lib/supabase/server";

export async function triggerVoiceCall(phone: string, name: string | null) {
  try {
    const supabase = await createAdminClient();

    // 1. Fetch Voice Agent configurations
    const { data: settings, error: settingsError } = await supabase
      .from("voice_agent_settings")
      .select("*")
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.log("VoiceAgent: settings not found or error:", settingsError);
      return { success: false, error: "Settings not configured" };
    }

    if (!settings.is_enabled) {
      console.log("VoiceAgent: trigger is disabled");
      return { success: false, error: "Voice agent is disabled" };
    }

    const apiKey = settings.vapi_api_key || process.env.VAPI_API_KEY;
    const assistantId = settings.vapi_assistant_id || process.env.VAPI_ASSISTANT_ID;

    if (!apiKey || !assistantId) {
      console.error("VoiceAgent: API Key or Assistant ID missing. Configure it in database.");
      return { success: false, error: "API Credentials missing" };
    }

    // Clean phone number format for Vapi (expects E.164, e.g. +917003249959)
    let cleanedPhone = phone;
    if (!cleanedPhone.startsWith("+")) {
      cleanedPhone = `+${cleanedPhone}`;
    }

    console.log(`VoiceAgent: triggering Vapi call to ${cleanedPhone} for lead "${name || "Valued Lead"}"`);

    // 2. Fire Call trigger request to Vapi.ai API
    const response = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assistantId: assistantId,
        customer: {
          number: cleanedPhone,
          name: name || "Valued Lead",
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Vapi API error (${response.status}): ${data.message || JSON.stringify(data)}`);
    }

    console.log("VoiceAgent: Call triggered successfully via Vapi. Call ID:", data.id);
    return { success: true, callId: data.id };
  } catch (err) {
    console.error("VoiceAgent: failed to trigger call:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
