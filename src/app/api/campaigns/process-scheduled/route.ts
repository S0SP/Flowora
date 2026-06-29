import { NextRequest, NextResponse } from "next/server";
import { processScheduledCampaigns } from "@/services/scheduler";

export const dynamic = "force-dynamic";

function verifyCronSecret(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return false;
    }
  }
  return true;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processScheduledCampaigns();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in process-scheduled GET:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processScheduledCampaigns();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error in process-scheduled POST:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
