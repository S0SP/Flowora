import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

const DOGRAH_API_URL = process.env.DOGRAH_API_URL;
const DOGRAH_SECRET = process.env.DOGRAH_SECRET;

// GET — list all voice agent presets for this workspace
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data, error } = await admin
      .from("voice_agents")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ agents: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create a new voice agent preset
export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const admin = await createAdminClient();

    if (!body.name) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    if (!DOGRAH_API_URL || !DOGRAH_SECRET) {
      console.warn("Dograh credentials missing, cannot provision workflow.");
      return NextResponse.json({ error: "Dograh credentials missing in environment" }, { status: 500 });
    }

    // 1. Prepare Dograh Workflow Graph
    const workflowDefinition = {
      nodes: [
        {
          id: "start-1",
          type: "startCall",
          position: { x: 0, y: 0 },
          data: {
            name: "Start",
            prompt: body.systemPrompt || "You are a helpful AI assistant.",
            voice_id: body.voiceId || "anushka",
            first_message: body.firstMessage || "",
          }
        }
      ],
      edges: []
    };

    // 2. Create Workflow in Dograh
    const createRes = await fetch(`${DOGRAH_API_URL}/api/v1/workflow/create/definition`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Flowra-Secret": DOGRAH_SECRET,
        "Authorization": `Bearer ${DOGRAH_SECRET}` // Some endpoints use this
      },
      body: JSON.stringify({
        name: `${body.name} (Flowra Workspace ${workspaceId})`,
        workflow_definition: workflowDefinition
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error("Failed to create workflow in Dograh:", errText);
      return NextResponse.json({ error: "Failed to provision workflow" }, { status: 502 });
    }

    const workflowData = await createRes.json();
    const dograhWorkflowId = workflowData.id;



    // 4. Save Preset to Flowra DB
    const insertData = {
      workspace_id: workspaceId,
      name: body.name,
      agent_type: body.agentType ?? "livekit",
      voice_id: body.voiceId ?? "anushka",
      system_prompt: body.systemPrompt ?? "",
      first_message: body.firstMessage ?? "",
      dograh_workflow_id: dograhWorkflowId,
      config: {
        call_objective: body.callObjective ?? "",
        language_preset: body.languagePreset ?? "hinglish",
        sarvam_language: body.sarvamLanguage ?? "hi-IN",
        deepgram_language: body.deepgramLanguage ?? "hi",
        calling_hours_start: body.callingHoursStart ?? "09:00",
        calling_hours_end: body.callingHoursEnd ?? "19:00",
        max_call_attempts: body.maxCallAttempts ?? 3,
        retry_interval_minutes: body.retryIntervalMinutes ?? 60,
        recording_enabled: body.recordingEnabled ?? true,
        transcription_enabled: body.transcriptionEnabled ?? true,
      },
    };

    const { data, error } = await admin
      .from("voice_agents")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Error inserting voice preset:", error);
      throw error;
    }

    return NextResponse.json({ agent: data });
  } catch (err: any) {
    console.error("Error in POST /api/voice/agents:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

