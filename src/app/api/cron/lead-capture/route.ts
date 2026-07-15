import { NextRequest, NextResponse } from "next/server";
import { syncActiveSheets, sendPendingLeads } from "@/services/lead-capture";

export const runtime = "nodejs";
export const maxDuration = 55;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  try {
    const [syncRes, sendRes] = await Promise.all([
      syncActiveSheets(),
      sendPendingLeads(),
    ]);

    return NextResponse.json({
      timestamp: now.toISOString(),
      sync: syncRes,
      process: sendRes,
    });
  } catch (err: any) {
    console.error("[cron/lead-capture] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
