import { SupabaseClient } from "@supabase/supabase-js"

function geminiLiveLanguage(languagePreset?: string, sarvamLanguage?: string) {
  if (languagePreset?.startsWith("en")) return "en"
  if (languagePreset === "hinglish") return "hi"
  if (languagePreset) return languagePreset
  return sarvamLanguage?.slice(0, 2) || "hi"
}

const GEMINI_LIVE_SUPPORTED_VOICES = new Set([
  "Puck", "Charon", "Kore", "Fenrir", "Aoede",
])

const GEMINI_LIVE_VOICE_FALLBACK: Record<string, string> = {
  Zephyr: "Puck",        Leda: "Aoede",         Orus: "Kore",          Callirrhoe: "Aoede",
  Autonoe: "Puck",       Enceladus: "Aoede",    Iocaste: "Charon",     Umbriel: "Aoede",
  Algieba: "Charon",     Despina: "Aoede",      Erinome: "Charon",     Algenib: "Fenrir",
  Rasalghul: "Charon",   Laomedeia: "Puck",     Achernar: "Aoede",     Alnilam: "Kore",
  Schedar: "Charon",     Gacrux: "Charon",      Pulcherrima: "Fenrir", Achird: "Puck",
  Zubenelgenubi: "Aoede",Vindemiatrix: "Aoede", Sadachbia: "Fenrir",   Sulafat: "Aoede",
  Sadaltager: "Charon",
}

function sanitizeGeminiLiveVoice(voiceId: string): string {
  if (GEMINI_LIVE_SUPPORTED_VOICES.has(voiceId)) return voiceId
  const fallback = GEMINI_LIVE_VOICE_FALLBACK[voiceId]
  if (fallback) {
    console.warn(`[dial] Voice "${voiceId}" is not supported by Gemini Live API. Falling back to "${fallback}".`)
    return fallback
  }
  console.warn(`[dial] Unknown Gemini voice "${voiceId}". Defaulting to "Puck".`)
  return "Puck"
}

const DEFAULT_FIRST_MESSAGE = "Haan, namaste! Main aapki kaise help kar sakti hoon aaj?"

export async function initiateVoiceCall(params: {
  supabase: SupabaseClient
  workspaceId: string
  userId?: string | null
  toNumber: string
  agentType?: string
  voiceId?: string
  systemPrompt?: string
  voiceIntent?: string
  deepgramLanguage?: string
  sarvamLanguage?: string
  languagePreset?: string
  presetId?: string
  metadataSource?: string
}) {
  const {
    supabase, workspaceId, userId, toNumber, agentType = "livekit", voiceId = "anushka",
    systemPrompt, voiceIntent, sarvamLanguage, languagePreset, presetId, metadataSource = "manual_dialer"
  } = params

  if (!toNumber || !/^[0-9+\s\-()]{6,15}$/.test(toNumber.replace(/\s/g, ""))) {
    throw new Error("Invalid phone number")
  }

  // 1. Resolve voice agent config
  let resolvedFirstMessage = DEFAULT_FIRST_MESSAGE
  let resolvedSystemPrompt = systemPrompt || ""

  const { data: agent } = await supabase
    .from("voice_agents")
    .select("first_message, system_prompt")
    .eq("workspace_id", workspaceId)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle()

  if (agent?.first_message) resolvedFirstMessage = agent.first_message
  if (!resolvedSystemPrompt && agent?.system_prompt) resolvedSystemPrompt = agent.system_prompt

  // 2. Resolve Dograh workflow ID
  let dograhWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10)

  const { data: voiceConn } = await supabase
    .from("channel_connections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("type", "voice")
    .maybeSingle()

  if (voiceConn?.config?.dograhWorkflowId) {
    const parsed = parseInt(voiceConn.config.dograhWorkflowId, 10)
    if (!isNaN(parsed)) dograhWorkflowId = parsed
  }

  if (presetId) {
    const { data: preset } = await supabase.from("voice_agents").select("dograh_workflow_id").eq("id", presetId).maybeSingle()
    if (preset?.dograh_workflow_id) dograhWorkflowId = preset.dograh_workflow_id
  } else {
    const { data: defaultAgent } = await supabase.from("voice_agents").select("dograh_workflow_id").eq("workspace_id", workspaceId).eq("is_enabled", true).limit(1).maybeSingle()
    if (defaultAgent?.dograh_workflow_id) dograhWorkflowId = defaultAgent.dograh_workflow_id
  }

  // 3. Insert Call Record
  const insertPayload: any = {
    workspace_id: workspaceId,
    phone_number: toNumber,
    agent_type: agentType,
    voice_id: voiceId,
    status: "initiated",
  }
  if (userId) insertPayload.user_id = userId

  const { data: callRecord, error: insertError } = await supabase
    .from("voice_calls")
    .insert(insertPayload)
    .select()
    .single()

  let finalCallRecord = callRecord
  if (insertError) {
    // Retry without workspace_id if it fails
    delete insertPayload.workspace_id
    const { data: fallback, error: fallbackErr } = await supabase.from("voice_calls").insert(insertPayload).select().single()
    if (fallbackErr) throw new Error("Failed to create call record")
    finalCallRecord = fallback
  }

  // 4. Build Model Overrides
  let modelOverrides: Record<string, any>
  if (agentType === "gemini") {
    modelOverrides = {
      is_realtime: true,
      realtime: {
        provider: "google_realtime",
        voice: sanitizeGeminiLiveVoice(voiceId),
        language: geminiLiveLanguage(languagePreset, sarvamLanguage),
      },
    }
  } else {
    modelOverrides = {
      is_realtime: false,
      tts: { voice: voiceId, language: sarvamLanguage || "hi-IN" },
    }
  }

  // 5. Initial Context
  const initialContext: Record<string, any> = {
    system_prompt: resolvedSystemPrompt,
    first_message: resolvedFirstMessage,
    model_overrides: modelOverrides,
  }
  if (voiceIntent) initialContext.call_objective = voiceIntent

  // 6. Call Dograh
  const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000"
  const flowraSecret = process.env.DOGRAH_SECRET || process.env.DOGRAH_API_SECRET || "change-me-in-production"

  const dograhRes = await fetch(`${dograhUrl}/api/v1/telephony/initiate-call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Flowra-Secret": flowraSecret },
    body: JSON.stringify({
      workflow_id: dograhWorkflowId,
      phone_number: toNumber,
      metadata: { flowra_source: metadataSource, preset_id: presetId || null, workspace_id: workspaceId },
      initial_context: initialContext,
    }),
  })

  if (!dograhRes.ok) {
    const errText = await dograhRes.text()
    throw new Error(`Dograh API error: ${errText}`)
  }
  const dograhData = await dograhRes.json()

  // 7. Update Record
  const workflowRunId = dograhData.workflow_run_id ? String(dograhData.workflow_run_id) : null
  await supabase
    .from("voice_calls")
    .update({
      livekit_room_name: workflowRunId ? `run-${workflowRunId}` : null,
      livekit_sip_call_id: workflowRunId,
      status: "ringing",
    })
    .eq("id", (finalCallRecord as any).id)

  return {
    ok: true,
    callId: (finalCallRecord as any).id,
    workflowRunId: dograhData.workflow_run_id,
    workflowRunName: dograhData.workflow_run_name,
  }
}
