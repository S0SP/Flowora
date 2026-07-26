import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

const DOGRAH_API_URL = process.env.DOGRAH_API_URL;
const DOGRAH_SECRET = process.env.DOGRAH_SECRET;

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// PUT — update a voice agent preset
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const admin = await createAdminClient();
    const { id: agentId } = await params;

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID is required" }, { status: 400 });
    }

    const updateData = {
      name: body.name,
      agent_type: body.agentType,
      voice_id: body.voiceId,
      system_prompt: body.systemPrompt,
      first_message: body.firstMessage,
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
      updated_at: new Date().toISOString(),
    };

    // Filter out undefined fields
    const filteredUpdate = Object.entries(updateData).reduce((acc, [k, v]) => {
      if (v !== undefined) acc[k] = v;
      return acc;
    }, {} as Record<string, any>);

    const { data, error } = await admin
      .from("voice_agents")
      .update(filteredUpdate)
      .eq("id", agentId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    // Sync updates to Dograh workflow if it exists
    if (data && data.dograh_workflow_id && DOGRAH_API_URL && DOGRAH_SECRET) {
      try {
        // 1. Fetch current workflow definition from Dograh
        const getRes = await fetch(
          `${DOGRAH_API_URL}/api/v1/workflow/fetch/${data.dograh_workflow_id}`,
          {
            headers: {
              "X-Flowra-Secret": DOGRAH_SECRET,
              "Authorization": `Bearer ${DOGRAH_SECRET}`,
            },
          }
        );

        if (getRes.ok) {
          const workflowData = await getRes.json();
          const workflowDefinition = workflowData.workflow_definition;
          let workflowConfigs = workflowData.workflow_configurations || {};

          // 2. Update the startCall node with new prompt/voice
          if (workflowDefinition && workflowDefinition.nodes) {
            workflowDefinition.nodes = workflowDefinition.nodes.map((node: any) => {
              if (node.type === "startCall") {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    prompt: body.systemPrompt !== undefined ? body.systemPrompt : node.data.prompt,
                    voice_id: body.voiceId !== undefined ? body.voiceId : node.data.voice_id,
                    first_message: body.firstMessage !== undefined ? body.firstMessage : node.data.first_message,
                  },
                };
              }
              return node;
            });
          }

          // 3. Update model overrides for Gemini if needed
          if (data.agent_type === "gemini" && body.voiceId) {
            workflowConfigs = {
              ...workflowConfigs,
              model_overrides: {
                ...(workflowConfigs.model_overrides || {}),
                is_realtime: true,
                realtime: {
                  provider: "google_realtime",
                  voice: body.voiceId,
                },
              },
            };
          } else {
            // If we switched away from gemini, we could optionally strip the overrides
            if (workflowConfigs.model_overrides?.realtime) {
               delete workflowConfigs.model_overrides.realtime;
            }
          }

          // 4. PUT updated definition & configs to Dograh (creates draft)
          const updateRes = await fetch(
            `${DOGRAH_API_URL}/api/v1/workflow/${data.dograh_workflow_id}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Flowra-Secret": DOGRAH_SECRET,
                "Authorization": `Bearer ${DOGRAH_SECRET}`,
              },
              body: JSON.stringify({
                workflow_definition: workflowDefinition,
                workflow_configurations: workflowConfigs,
              }),
            }
          );

          if (!updateRes.ok) {
            console.warn(`[agents/${data.dograh_workflow_id}] Failed to update workflow draft: ${await updateRes.text()}`);
          } else {
            // 5. POST publish to make the draft live
            const publishRes = await fetch(
              `${DOGRAH_API_URL}/api/v1/workflow/${data.dograh_workflow_id}/publish`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Flowra-Secret": DOGRAH_SECRET,
                  "Authorization": `Bearer ${DOGRAH_SECRET}`,
                },
              }
            );

            if (!publishRes.ok) {
              console.warn(`[agents/${data.dograh_workflow_id}] Failed to publish workflow: ${await publishRes.text()}`);
            }
          }
        } else {
          console.warn(`[agents/${data.dograh_workflow_id}] Failed to fetch workflow from Dograh: ${await getRes.text()}`);
        }
      } catch (e) {
        console.error(`[agents/${data.dograh_workflow_id}] Error syncing to Dograh:`, e);
      }
    }

    return NextResponse.json({ agent: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — delete a voice agent preset
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();
    const { id: agentId } = await params;

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID is required" }, { status: 400 });
    }

    // 1. Fetch the agent to get the Dograh workflow ID
    const { data: agent, error: fetchError } = await admin
      .from("voice_agents")
      .select("dograh_workflow_id")
      .eq("id", agentId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const dograhWorkflowId = agent.dograh_workflow_id;

    // 2. Archive the workflow in Dograh (there is no hard delete in Dograh for workflows)
    if (DOGRAH_API_URL && DOGRAH_SECRET && dograhWorkflowId) {
      const archiveRes = await fetch(`${DOGRAH_API_URL}/api/v1/workflow/${dograhWorkflowId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Flowra-Secret": DOGRAH_SECRET,
          "Authorization": `Bearer ${DOGRAH_SECRET}`
        },
        body: JSON.stringify({ status: "archived" })
      });
      
      if (!archiveRes.ok) {
        console.warn(`Failed to archive Dograh workflow ${dograhWorkflowId}`);
      }
    }

    // 3. Delete the preset from Flowra
    const { error } = await admin
      .from("voice_agents")
      .delete()
      .eq("id", agentId)
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting agent preset:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

