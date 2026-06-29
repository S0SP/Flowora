import { SupabaseClient } from "@supabase/supabase-js";

export async function getOrUpdatePromptCache(
  supabase: SupabaseClient,
  settings: {
    id: string;
    system_prompt: string;
    is_caching_enabled: boolean;
    cache_resource_name?: string | null;
    cache_expires_at?: string | null;
  },
  apiKey: string
): Promise<string | null> {
  // 0. If caching is disabled in settings, bypass cache and return null immediately
  if (!settings.is_caching_enabled) {
    console.log("Chatbot Cache: Caching is disabled in configurations. Bypassing cache.");
    return null;
  }

  const prompt = settings.system_prompt || "";

  // 1. Google Gemini Context Caching requires a minimum token size.
  // Generally, the limit is 32,768 tokens (roughly ~120,000 characters).
  // If the prompt is smaller, bypass caching to avoid Google API validation errors.
  if (prompt.length < 120000) {
    console.log(`Chatbot Cache: Prompt length (${prompt.length} chars) is below caching threshold. Bypassing cache.`);
    return null;
  }

  // 2. Check if we have an active, non-expired cache resource in the database
  if (settings.cache_resource_name && settings.cache_expires_at) {
    const expireTime = new Date(settings.cache_expires_at).getTime();
    const now = Date.now();
    
    // If the cache is still valid (leaving 30 seconds buffer)
    if (expireTime > now + 30000) {
      console.log(`Chatbot Cache: Found valid cache resource: ${settings.cache_resource_name}. Expires at ${settings.cache_expires_at}`);
      return settings.cache_resource_name;
    }
  }

  console.log("Chatbot Cache: Cache expired or missing. Registering new prompt context with Gemini API...");

  try {
    // 3. Register prompt context with the Google Gemini cachedContents API
    const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "models/gemini-2.5-flash",
        contents: [],
        systemInstruction: {
          parts: [{ text: prompt }],
        },
        ttl: "3600s", // Cache content for 1 hour (Google automatically refreshes / keeps it alive)
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Google CachedContent API error (${res.status}): ${data.error?.message || JSON.stringify(data)}`);
    }

    const cacheName = data.name;
    const expiresAt = data.expireTime;

    if (!cacheName) {
      throw new Error("Invalid cache resource response from Google API.");
    }

    console.log(`Chatbot Cache: Context registered successfully. Resource: ${cacheName}, Expires: ${expiresAt}`);

    // 4. Update the settings row in the database
    const { error: updateError } = await supabase
      .from("chatbot_settings")
      .update({
        cache_resource_name: cacheName,
        cache_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);

    if (updateError) {
      console.error("Chatbot Cache: failed to update DB cache logs:", updateError);
    }

    return cacheName;
  } catch (err) {
    console.error("Chatbot Cache: error creating context cache resource:", err);
    // Graceful fallback: return null to let the conversation proceed uncached
    return null;
  }
}
