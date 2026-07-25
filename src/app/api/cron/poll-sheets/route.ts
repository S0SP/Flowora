/**
 * Google Sheet Workflow Trigger Poller Route (/api/cron/poll-sheets)
 * Can be triggered directly or via master scheduler /api/cron/run.
 */

import { NextRequest, NextResponse } from "next/server";
import { pollActiveSheets } from "@/services/cron-workers";

export const runtime = "nodejs";
export const maxDuration = 55;

const CRON_SECRET = process.env.CRON_SECRET;

function verifyCronAuth(req: NextRequest): boolean {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  const secretParam = req.nextUrl.searchParams.get("secret") || req.nextUrl.searchParams.get("key") || req.nextUrl.searchParams.get("token");
  if (secretParam === CRON_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await pollActiveSheets();
    return NextResponse.json(res);
  } catch (err: any) {
    console.error("[cron/poll-sheets] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
