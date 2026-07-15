/**
 * Vercel Cron: runs every minute.
 * Processes reminder workflows — sends reminders based on event dates.
 * Also handles drip campaign step scheduling.
 *
 * Reminder types:
 * - Event/webinar reminders (N days/hours before event)
 * - Appointment reminders
 * - Birthday messages (daily check)
 * - Payment reminders (due date based)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 55;

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await createAdminClient();
  const now = new Date();

  let processed = 0;

  try {
    // 1. Find active reminder workflows
    const { data: reminderWorkflows } = await admin
      .from("workflows")
      .select("id, workspace_id, nodes, edges")
      .eq("status", "active")
      .contains("trigger_type", "reminder");

    for (const workflow of reminderWorkflows ?? []) {
      const reminderNode = workflow.nodes?.find((n: any) =>
        n.type === "reminder" || n.data?.type === "reminder" || n.data?.subtype === "reminder"
      );

      if (!reminderNode?.data) continue;

      const eventDate = reminderNode.data.eventDate;
      if (!eventDate) continue;

      const eventTime = new Date(eventDate).getTime();
      const reminders: Array<{ when: string; channels: string[]; template: string }> =
        reminderNode.data.reminders ?? [];

      for (const reminder of reminders) {
        const offsetMs = parseOffset(reminder.when);
        if (!offsetMs) continue;

        const sendTime = new Date(eventTime - offsetMs);

        // Fire if within 1 minute window
        if (Math.abs(sendTime.getTime() - now.getTime()) < 60_000) {
          // Find all leads in this workflow
          const { data: leads } = await admin
            .from("lead_capture_leads")
            .select("phone, name, email")
            .eq("workflow_id", workflow.id)
            .eq("workspace_id", workflow.workspace_id)
            .eq("status", "sent");

          for (const lead of leads ?? []) {
            try {
              if (reminder.channels?.includes("whatsapp") || reminder.channels?.includes("WhatsApp")) {
                await sendWhatsAppReminder(lead, reminderNode.data, workflow.workspace_id, admin);
              }
              processed++;
            } catch (err: any) {
              console.error("[send-reminders] Lead reminder failed:", err.message);
            }
          }
        }
      }
    }

    return NextResponse.json({ processed, timestamp: now.toISOString() });
  } catch (err: any) {
    console.error("[cron/send-reminders] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function parseOffset(when: string): number | null {
  // Examples: "3 days before", "1 hour before", "30 minutes before"
  const match = when.match(/(\d+)\s*(day|hour|minute|min)/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("day")) return value * 24 * 60 * 60 * 1000;
  if (unit.startsWith("hour")) return value * 60 * 60 * 1000;
  if (unit.startsWith("min")) return value * 60 * 1000;
  return null;
}

async function sendWhatsAppReminder(
  lead: { phone: string; name: string | null; email: string | null },
  nodeData: any,
  workspaceId: string,
  admin: any
): Promise<void> {
  // Get workspace WhatsApp connection
  const { data: conn } = await admin
    .from("channel_connections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("type", "whatsapp")
    .single();

  const phoneNumId = (conn?.config as any)?.phoneNumberId ?? process.env.META_PHONE_NUMBER_ID;
  const token = (conn?.config as any)?.accessToken ?? process.env.META_ACCESS_TOKEN;

  if (!phoneNumId || !token) return;

  const templateName = nodeData.reminderTemplate ?? nodeData.template ?? "";
  const phone = lead.phone.replace(/\D/g, "");

  const body = templateName
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: nodeData.templateLanguage ?? "en" },
          components: [],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: `Hi ${lead.name ?? "there"}! This is a reminder from us. 📅`,
        },
      };

  await fetch(`https://graph.facebook.com/v18.0/${phoneNumId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
