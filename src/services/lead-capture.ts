import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate } from "./meta";
import { parsePhoneFromExcel, isValidPhone } from "@/lib/utils";
import { sendMail, compileEmailTemplate } from "./mailer";
import Papa from "papaparse";
import crypto from "crypto";

// Extracts Google Sheet spreadsheet ID from URL
export function getSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Fetches Google Sheet as CSV and parses it
export async function fetchGoogleSheetRows(url: string): Promise<Record<string, string>[]> {
  const spreadsheetId = getSpreadsheetId(url);
  if (!spreadsheetId) {
    throw new Error("Invalid Google Sheets URL. Make sure it contains '/spreadsheets/d/...'");
  }

  // Construct public CSV export URL
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

  const res = await fetch(exportUrl, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    },
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error("Failed to access Google Sheet. Verify it is shared as 'Anyone with the link can view'.");
  }

  const csvText = await res.text();
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return (parsed.data as Record<string, string>[]) || [];
}

let isSyncing = false;

// 1. Sync active Google Sheets into the queue
export async function syncActiveSheets() {
  if (isSyncing) return { skipped: true, reason: "Already syncing" };
  isSyncing = true;

  try {
    const supabase = await createAdminClient();

    // Query active configurations
    const { data: settings, error: settingsError } = await supabase
      .from("lead_capture_settings")
      .select("*")
      .eq("is_active", true);

    if (settingsError || !settings) {
      console.error("LeadCapture: failed to fetch active settings:", settingsError);
      return { success: false, error: settingsError?.message };
    }

    let totalSyncedLeads = 0;

    for (const setting of settings) {
      try {
        console.log(`LeadCapture: syncing sheet for setting ${setting.id}`);
        const rows = await fetchGoogleSheetRows(setting.sheet_url);
        
        const leadsToInsert = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rawPhone = row[setting.phone_column];
          
          if (!rawPhone) continue;
          
          const phone = parsePhoneFromExcel(rawPhone);
          if (!isValidPhone(phone)) continue;

          const name = setting.name_column ? row[setting.name_column]?.trim() : null;
          const email = setting.email_column ? row[setting.email_column]?.trim() : null;

          // Generate unique row hash for deduplication
          const rowHashSource = `${phone}_${name || ""}_${email || ""}_${i}`;
          const rowHash = crypto.createHash("md5").update(rowHashSource).digest("hex");

          // Schedule for delay
          const scheduledFor = new Date(Date.now() + setting.delay_minutes * 60000).toISOString();

          leadsToInsert.push({
            lead_capture_settings_id: setting.id,
            phone,
            name: name || null,
            email: email || null,
            row_hash: rowHash,
            status: "pending",
            scheduled_for: scheduledFor,
          });
        }

        if (leadsToInsert.length > 0) {
          // Perform bulk insert and ignore duplicates on row_hash conflict
          const { error: insertError } = await supabase
            .from("lead_capture_leads")
            .upsert(leadsToInsert, { onConflict: "row_hash", ignoreDuplicates: true });

          if (insertError) {
            console.error(`LeadCapture: error inserting leads for setting ${setting.id}:`, insertError);
          } else {
            totalSyncedLeads += leadsToInsert.length;
          }
        }
      } catch (sheetError) {
        console.error(`LeadCapture: failed to process sheet for setting ${setting.id}:`, sheetError);
      }
    }

    return { success: true, synced: totalSyncedLeads };
  } catch (err) {
    console.error("LeadCapture: unexpected sync error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    isSyncing = false;
  }
}

let isProcessingLeads = false;

// 2. Process and send pending messages
export async function sendPendingLeads() {
  if (isProcessingLeads) return { skipped: true, reason: "Already processing leads" };
  isProcessingLeads = true;

  try {
    const supabase = await createAdminClient();

    // Query pending leads scheduled to run now
    const { data: leads, error: leadsError } = await supabase
      .from("lead_capture_leads")
      .select("*, lead_capture_settings(*)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(10); // Process in batches of 10

    if (leadsError || !leads) {
      console.error("LeadCapture: failed to fetch pending leads:", leadsError);
      return { success: false, error: leadsError?.message };
    }

    let processedCount = 0;

    for (const lead of leads) {
      // Concurrency lock: transition from 'pending' -> 'processing'
      const { data: lockedLead, error: lockError } = await supabase
        .from("lead_capture_leads")
        .update({ status: "processing" })
        .eq("id", lead.id)
        .eq("status", "pending")
        .select();

      if (lockError || !lockedLead || lockedLead.length === 0) {
        continue;
      }

      const setting = lead.lead_capture_settings;
      if (!setting) {
        await supabase
          .from("lead_capture_leads")
          .update({ status: "failed", error_message: "Configuration settings not found" })
          .eq("id", lead.id);
        continue;
      }

      try {
        // 1. Upsert contact
        const { data: upsertedContact, error: contactError } = await supabase
          .from("contacts")
          .upsert(
            { phone: lead.phone, name: lead.name, email: lead.email, last_message_at: new Date().toISOString() },
            { onConflict: "phone" }
          )
          .select("id")
          .single();

        if (contactError || !upsertedContact) {
          throw new Error(contactError?.message ?? "Failed to upsert contact");
        }

        let waSent = false;
        let waError = null;
        let emailSent = false;
        let emailError = null;
        let voiceSent = false;
        let voiceError = null;

        // 2a. Send WhatsApp if enabled
        if (setting.whatsapp_enabled !== false) {
          if (setting.template_name) {
            const { ok, wamid, error } = await sendWhatsAppTemplate(
              lead.phone,
              setting.template_name,
              setting.template_language
            );
            
            waSent = ok;
            waError = error;

            // Log WhatsApp message in messages history table
            await supabase.from("messages").insert({
              contact_id: upsertedContact.id,
              wamid: wamid ?? null,
              direction: "outbound",
              content: `📢 Lead Capture (WhatsApp) — Template: ${setting.template_name}`,
              status: ok ? "sent" : "failed",
              sent_at: new Date().toISOString(),
            });
            
            await supabase.rpc("increment_message_count", { contact_id: upsertedContact.id });
          } else {
            waError = "WhatsApp template name is missing";
          }
        }

        // 2b. Send Email if enabled and email address is provided
        if (setting.email_enabled && lead.email) {
          try {
            const emailHtml = compileEmailTemplate(
              setting.email_template_id || "welcome",
              {
                brand_name: setting.email_brand_name,
                logo_url: setting.email_logo_url,
                title: setting.email_title,
                body: setting.email_body,
                button_text: setting.email_button_text,
                button_url: setting.email_button_url,
                footer: setting.email_footer,
              },
              {
                name: lead.name,
                email: lead.email,
                phone: lead.phone,
              }
            );

            await sendMail(
              {
                smtp_host: setting.smtp_host,
                smtp_port: setting.smtp_port,
                smtp_user: setting.smtp_user,
                smtp_password: setting.smtp_password,
                email_from_name: setting.email_from_name,
                email_from: setting.email_from,
              },
              lead.email,
              setting.email_subject || "New Lead Confirmation",
              emailHtml
            );
            emailSent = true;

            // Log Email in messages history table
            await supabase.from("messages").insert({
              contact_id: upsertedContact.id,
              wamid: null,
              direction: "outbound",
              content: `📧 Lead Capture (Email) — Subject: ${setting.email_subject || "New Lead Confirmation"}`,
              status: "sent",
              sent_at: new Date().toISOString(),
            });
          } catch (e) {
            emailError = e instanceof Error ? e.message : "SMTP Error";
            console.error(`LeadCapture: failed to send email to ${lead.email}:`, e);

            await supabase.from("messages").insert({
              contact_id: upsertedContact.id,
              wamid: null,
              direction: "outbound",
              content: `📧 Lead Capture (Email) — Subject: ${setting.email_subject || "New Lead Confirmation"}`,
              status: "failed",
              sent_at: new Date().toISOString(),
            });
          }
        } else if (setting.email_enabled && !lead.email) {
          emailError = "No email address found in lead row data";
        }

        // 2c. Voice Call if enabled
        if (setting.voice_enabled) {
          try {
            // Replace placeholders in the voice prompt
            const brandName = setting.email_brand_name || "My Agency";
            const replacePlaceholders = (text: string) => {
              return text
                .replace(/\{\{lead_name\}\}/g, lead.name || "friend")
                .replace(/\{\{lead_email\}\}/g, lead.email || "")
                .replace(/\{\{lead_phone\}\}/g, lead.phone)
                .replace(/\{\{brand_name\}\}/g, brandName);
            };

            const systemPrompt = setting.voice_prompt 
              ? replacePlaceholders(setting.voice_prompt) 
              : `You are an AI assistant for ${brandName}. You are calling a new lead named ${lead.name || "friend"}. Be helpful and answer their questions.`;

            // Call the internal Next.js API for dialing
            const dialRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/voice/dial`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                toNumber: lead.phone,
                agentType: setting.voice_agent_type || "livekit",
                voiceId: setting.voice_id || "anushka",
                systemPrompt,
              }),
            });

            if (!dialRes.ok) {
              const err = await dialRes.json();
              throw new Error(err.error || "Dial API failed");
            }

            voiceSent = true;
            await supabase.from("messages").insert({
              contact_id: upsertedContact.id,
              wamid: null,
              direction: "outbound",
              content: `📞 Lead Capture (Voice) — Agent: ${setting.voice_agent_type || "livekit"}`,
              status: "sent",
              sent_at: new Date().toISOString(),
            });
          } catch (e) {
            voiceError = e instanceof Error ? e.message : "Voice Call Error";
            console.error(`LeadCapture: failed to trigger voice call to ${lead.phone}:`, e);
            await supabase.from("messages").insert({
              contact_id: upsertedContact.id,
              wamid: null,
              direction: "outbound",
              content: `📞 Lead Capture (Voice) — Agent: ${setting.voice_agent_type || "livekit"}`,
              status: "failed",
              sent_at: new Date().toISOString(),
            });
          }
        }

        // 3. Determine overall success/failure
        const hasWhatsAppTask = setting.whatsapp_enabled !== false;
        const hasEmailTask = !!(setting.email_enabled && lead.email);
        const hasVoiceTask = !!setting.voice_enabled;

        let overallSuccess = true;
        let finalErrorParts = [];

        if (hasWhatsAppTask && !waSent) {
          overallSuccess = false;
          finalErrorParts.push(`WhatsApp failed: ${waError || "unknown"}`);
        }
        if (hasEmailTask && !emailSent) {
          overallSuccess = false;
          finalErrorParts.push(`Email failed: ${emailError || "unknown"}`);
        }
        if (hasVoiceTask && !voiceSent) {
          overallSuccess = false;
          finalErrorParts.push(`Voice failed: ${voiceError || "unknown"}`);
        }
        if (!hasWhatsAppTask && !hasEmailTask && !hasVoiceTask) {
          overallSuccess = false;
          finalErrorParts.push("No active channels (WhatsApp/Email/Voice) for this lead run");
        }

        const finalErrorMessage = finalErrorParts.length > 0 ? finalErrorParts.join(" | ") : null;

        // 4. Update lead status in queue log
        await supabase
          .from("lead_capture_leads")
          .update({
            status: overallSuccess ? "sent" : "failed",
            processed_at: new Date().toISOString(),
            error_message: finalErrorMessage,
          })
          .eq("id", lead.id);

        processedCount++;
      } catch (leadError) {
        console.error(`LeadCapture: error executing lead send for ${lead.id}:`, leadError);
        await supabase
          .from("lead_capture_leads")
          .update({
            status: "failed",
            processed_at: new Date().toISOString(),
            error_message: leadError instanceof Error ? leadError.message : "Unknown error",
          })
          .eq("id", lead.id);
      }
    }

    return { success: true, processed: processedCount };
  } catch (err) {
    console.error("LeadCapture: unexpected process error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  } finally {
    isProcessingLeads = false;
  }
}
