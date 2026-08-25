import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function verifyCronSecret(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.FLOWORA_CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.FLOWORA_CRON_SECRET}`) {
      return false;
    }
  }
  return true;
}

/**
 * Forwards the campaign processing request to the Django engine when
 * DJANGO_ENGINE_URL is configured. The engine runs processScheduledCampaigns()
 * natively as a Celery task, so this is just a manual "run now" trigger.
 *
 * If DJANGO_ENGINE_URL is not set, falls back to the local TypeScript
 * processScheduledCampaigns() implementation (dev/fallback only).
 */
async function runCampaignProcessing(): Promise<{ status: string; result?: unknown; error?: string }> {
  const engineUrl = process.env.DJANGO_ENGINE_URL;
  const engineSecret = process.env.DJANGO_ENGINE_SECRET;

  if (engineUrl) {
    try {
      const res = await fetch(`${engineUrl}/api/execute/process-campaigns/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(engineSecret ? { Authorization: `Bearer ${engineSecret}` } : {}),
        },
        body: JSON.stringify({ async: false }),
        // Use AbortSignal to respect Vercel's timeout limits
        signal: AbortSignal.timeout(55000),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[process-queue] Engine responded with error:", res.status, text);
        return { status: "engine_error", error: `Engine returned ${res.status}` };
      }

      const data = await res.json();
      return { status: "engine_success", result: data };
    } catch (err) {
      console.error("[process-queue] Failed to call engine:", err);
      // Fallback to local processing if engine is unreachable
    }
  }

  // Fallback: run locally (used in dev or if engine is down)
  const { processScheduledCampaigns } = await import("@/services/scheduler");
  const result = await processScheduledCampaigns();
  return { status: "local_fallback", result };
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyCronSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runCampaignProcessing();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in process-queue GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCronSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runCampaignProcessing();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in process-queue POST:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
