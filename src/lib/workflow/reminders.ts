/**
 * Scheduled Reminder Helper Library
 * Processes reminder workflows — sends reminders based on event dates.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getWhatsAppCredentials } from "@/lib/whatsapp/auth";

export async function sendDueReminders(admin?: any): Promise<{ processed: number; timestamp: string }> {
  if (!admin) {
    admin = await createAdminClient();
  }
  const now = new Date();
  let processed = 0;

  try {
    const { data: reminderWorkflows } = await admin
      .from("workflows")
      .select("*")
      .eq("status", "active")
      .contains("trigger_type", "reminder");

    for (const workflow of reminderWorkflows ?? []) {
      const actualNodes: any[] = (workflow as any).graph?.nodes ?? (workflow as any).nodes ?? [];
      const reminderNode = actualNodes.find((n: any) =>
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

        if (Math.abs(sendTime.getTime() - now.getTime()) < 60_000) {
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
              console.error("[sendDueReminders] Lead reminder failed:", err.message);
            }
          }
        }
      }
    }

    return { processed, timestamp: now.toISOString() };
  } catch (err: any) {
    console.error("[sendDueReminders] Error:", err);
    throw err;
  }
}

function parseOffset(when: string): number | null {
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
  const credentials = await getWhatsAppCredentials(workspaceId, admin);

  const phoneNumId = credentials?.phoneNumberId;
  const token = credentials?.accessToken;

  if (!phoneNumId || !token) return;

  const templateName = nodeData.reminderTemplate ?? nodeData.template ?? "";
  const phone = lead.phone.replace(/\D/g, "");

  const { sendTemplateMessage, sendTextMessage } = await import("@/lib/whatsapp/meta-api");

  try {
    if (templateName) {
      await sendTemplateMessage({
        phoneNumberId: phoneNumId,
        accessToken: token,
        to: phone,
        templateName: templateName,
        language: nodeData.templateLanguage ?? "en",
      });
    } else {
      await sendTextMessage({
        phoneNumberId: phoneNumId,
        accessToken: token,
        to: phone,
        text: `Hi ${lead.name ?? "there"}! This is a reminder from us. 📅`,
      });
    }
  } catch (err: any) {
    console.error("[sendWhatsAppReminder] Meta API error:", err.message);
  }
}
