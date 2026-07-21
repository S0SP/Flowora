import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/voice/calls/[id]/recording
 *
 * Proxy route: authenticates the Supabase user, verifies the call belongs
 * to them, then fetches a presigned recording URL from the Dograh backend
 * and returns it to the frontend.
 *
 * Multi-tenant safety:
 *  - Supabase query is scoped to `user_id = auth.uid()` so a user can
 *    never request a recording for another tenant's call.
 *  - Dograh validates the shared secret and the workflow_run_id existence.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: callId } = await params;

    // 1. Authenticate Supabase user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the call record — scoped to this user so cross-tenant access
    //    is impossible at the DB level.
    const { data: call, error: dbError } = await supabase
      .from("voice_calls")
      .select("id, livekit_sip_call_id, recording_url")
      .eq("id", callId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) {
      console.error("[recording proxy] DB error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // 3. If Flowra already has a direct recording_url (LiveKit egress path),
    //    return it immediately — no need to call Dograh.
    if (call.recording_url) {
      return NextResponse.json({ url: call.recording_url });
    }

    // 4. livekit_sip_call_id stores the Dograh workflow_run_id (set in dial/route.ts)
    const workflowRunId = call.livekit_sip_call_id;
    if (!workflowRunId) {
      return NextResponse.json(
        { error: "no_recording" },
        { status: 404 }
      );
    }

    // 5. Fetch presigned URL from Dograh
    const dograhUrl =
      process.env.DOGRAH_API_URL || "http://localhost:8000";
    const flowraSecret =
      process.env.DOGRAH_SECRET ||
      process.env.DOGRAH_API_SECRET ||
      "change-me-in-production";

    const dograhRes = await fetch(
      `${dograhUrl}/api/v1/recordings/workflow-run/${workflowRunId}`,
      {
        method: "GET",
        headers: {
          "X-Flowra-Secret": flowraSecret,
        },
        // 8-second timeout — presigned URL generation should be fast
        signal: AbortSignal.timeout(8000),
      }
    );

    if (dograhRes.status === 404) {
      // Recording not ready yet (call may still be processing)
      return NextResponse.json({ error: "no_recording" }, { status: 404 });
    }

    if (!dograhRes.ok) {
      const errText = await dograhRes.text();
      console.error(
        `[recording proxy] Dograh error ${dograhRes.status}: ${errText}`
      );
      return NextResponse.json(
        { error: "Failed to fetch recording URL" },
        { status: 502 }
      );
    }

    const { presigned_url } = await dograhRes.json();
    return NextResponse.json({ url: presigned_url });
  } catch (err: any) {
    console.error("[recording proxy] unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
