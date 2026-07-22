/**
 * POST /api/voice/webhook/dograh
 *
 * Dograh completion webhook — called by Dograh when a workflow run finishes.
 * Updates the matching voice_calls row with status, duration, and recording URL.
 *
 * Configure this in Dograh admin → Organization → Webhook URL:
 *   https://your-flowra-domain.com/api/voice/webhook/dograh
 *
 * Dograh signs nothing on this webhook; we validate using the shared secret
 * sent in the X-Flowra-Secret header (same secret used on outbound calls).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // ── Auth: validate shared secret ─────────────────────────────────────────
    const incomingSecret =
      req.headers.get("x-flowra-secret") ||
      req.headers.get("x-dograh-secret") ||
      req.headers.get("authorization")?.replace("Bearer ", "");

    const expectedSecret =
      process.env.DOGRAH_SECRET ||
      process.env.DOGRAH_API_SECRET ||
      "change-me-in-production";

    if (incomingSecret !== expectedSecret) {
      console.warn("[dograh webhook] Unauthorized — bad secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await req.json();
    console.log("[dograh webhook] Received:", JSON.stringify(payload, null, 2));

    // ── Parse Dograh webhook payload ─────────────────────────────────────────
    // Dograh sends different event shapes depending on type.
    // We care about run completion events.
    const {
      event,            // "run.completed" | "run.failed" | "call.ended" etc.
      workflow_run_id,
      run_id,           // alias
      duration,         // duration in seconds (may be number or string)
      duration_seconds,
      recording_url,
      transcript,
      transcript_text,
      status,
      direction,
      from_number,
      to_number,
      metadata,
    } = payload;

    const runId = workflow_run_id ?? run_id ?? payload?.run?.id;
    if (!runId) {
      // Not a run event we care about
      return NextResponse.json({ ok: true, skipped: true });
    }

    const supabase = await createAdminClient();

    // ── Find matching voice_call by livekit_sip_call_id = runId ─────────────
    let { data: call } = await supabase
      .from("voice_calls")
      .select("id, status")
      .eq("livekit_sip_call_id", String(runId))
      .maybeSingle();

    if (!call) {
      // ── Try to handle as Inbound Call ──────────────────────────────────────
      console.log(`[dograh webhook] No voice_call found for run_id=${runId}. Checking if inbound...`);
      
      const callDir = direction ?? metadata?.direction;
      const toPhone = to_number ?? metadata?.to_number;
      const fromPhone = from_number ?? metadata?.from_number;

      if (toPhone && fromPhone) {
        const cleanToPhone = toPhone.replace(/\D/g, "");
        const { data: allConns } = await supabase
          .from("channel_connections")
          .select("workspace_id, config")
          .eq("type", "voice");
          
        const matched = allConns?.find(c => {
          const p = c.config?.phone?.replace(/\D/g, "");
          return p === cleanToPhone || (p && cleanToPhone.includes(p)) || (p && p.includes(cleanToPhone));
        });

        if (matched?.workspace_id) {
          const workspaceId = matched.workspace_id;
          const { data: member } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", workspaceId)
            .limit(1)
            .maybeSingle();

          if (member?.user_id) {
            const { data: newCall, error: insertErr } = await supabase
              .from("voice_calls")
              .insert({
                user_id: member.user_id,
                workspace_id: workspaceId,
                phone_number: fromPhone,
                agent_type: "inbound",
                voice_id: "inbound",
                status: "completed",
                livekit_room_name: `run-${runId}`,
                livekit_sip_call_id: String(runId),
              })
              .select("id")
              .single();

            if (!insertErr && newCall) {
              call = { id: newCall.id, status: "completed" };
              console.log(`[dograh webhook] Created inbound voice_call ${call.id}`);
            } else {
              console.error("[dograh webhook] Failed to insert inbound call:", insertErr);
            }
          }
        }
      }

      if (!call) {
        console.warn(`[dograh webhook] Could not create inbound call record for run_id=${runId}. Skipping.`);
        return NextResponse.json({ ok: true, skipped: true });
      }
    }

    // ── Determine final status ────────────────────────────────────────────────
    let finalStatus = "completed";
    if (
      event === "run.failed" ||
      status === "failed" ||
      status === "error"
    ) {
      finalStatus = "failed";
    }

    const durationSecs = duration_seconds ??
      (typeof duration === "number" ? duration : parseInt(duration ?? "0", 10));

    // ── Recording URL: Dograh sends S3 presigned URL or public URL ───────────
    // We store it directly if provided; otherwise the recording proxy route
    // will fetch it from Dograh on demand via GET /api/voice/calls/[id]/recording.
    const recordingUrlToStore = recording_url ?? null;

    // ── Transcript ────────────────────────────────────────────────────────────
    const transcriptToStore =
      transcript_text ??
      (typeof transcript === "string" ? transcript : null) ??
      (Array.isArray(transcript)
        ? transcript
            .map((t: any) =>
              `${t.role ?? t.speaker ?? "?"}: ${t.text ?? t.content ?? ""}`
            )
            .join("\n")
        : null);

    // ── Update voice_calls ────────────────────────────────────────────────────
    const updatePayload: Record<string, any> = {
      status: finalStatus,
      updated_at: new Date().toISOString(),
    };

    if (durationSecs > 0) updatePayload.duration_seconds = durationSecs;
    if (recordingUrlToStore) updatePayload.recording_url = recordingUrlToStore;
    if (transcriptToStore) updatePayload.transcript = transcriptToStore;

    const { error: updateErr } = await supabase
      .from("voice_calls")
      .update(updatePayload)
      .eq("id", call.id);

    if (updateErr) {
      console.error("[dograh webhook] DB update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    console.log(
      `[dograh webhook] Updated voice_call ${call.id} → status=${finalStatus}` +
        ` duration=${durationSecs}s recording=${!!recordingUrlToStore}`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[dograh webhook] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}