/**
 * API Route: /api/jobs/campaign-execute
 * Calls synchronous campaign execution from library.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeCampaignSynchronously } from "@/lib/campaign/executor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scheduleId, workspaceId, templateName, templateLanguage, recipientsFilter } = body;

    if (!scheduleId || !workspaceId || !templateName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await executeCampaignSynchronously({
      scheduleId,
      workspaceId,
      templateName,
      templateLanguage,
      recipientsFilter,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    });
  } catch (err: any) {
    console.error("[jobs/campaign-execute POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
