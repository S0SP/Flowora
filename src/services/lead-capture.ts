import { createAdminClient } from "@/lib/supabase/server";
import { sendWhatsAppTemplate } from "./meta";
import { parsePhoneFromExcel, isValidPhone } from "@/lib/utils";
import { sendMail, compileEmailTemplate } from "./mailer";
import { dialSip, startEgressRecording } from "@/lib/livekit";
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

    // Resolve an owner user_id for voice call records (single-tenant app).
    // Voice calls are placed server-to-server via dialSip, so no auth session
    // exists here — we attribute the call record to the most recent caller.
    let dialUserId: string | null = null;
    if (leads.some((l) => l.lead_capture_settings?.voice_enabled)) {
      const { data: anyCall } = await supabase
        .from("voice_calls")
        .select("user_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      dialUserId = anyCall?.user_id ?? null;
      if (!dialUserId) {
        console.warn("LeadCapture: no existing voice_calls owner found; voice call will be placed without a call-log record.");
      }
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
            console.log(`LeadCapture: WhatsApp -> ${lead.phone} ok=${ok}${error ? ` error=${error}` : ` wamid=${wamid}`}`);

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
            // Make Gmail's opaque "535 BadCredentials" actionable for the user.
            const code = (e as { code?: string })?.code;
            if (code === "EAUTH" || /5\.7\.8|BadCredentials|Username and Password not accepted/i.test(emailError)) {
              emailError =
                "Gmail rejected the login (535 BadCredentials). Use a 16-character Google App Password — NOT your normal Gmail password — and make sure 2-Step Verification is ON. The SMTP user must be your full Gmail address.";
            }
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

            const agentType: "livekit" | "gemini" =
              setting.voice_agent_type === "gemini" ? "gemini" : "livekit";
            const voiceId = setting.voice_id || "anushka";

            // Place the SIP call directly via LiveKit (server-to-server).
            // The old code did fetch('/api/voice/dial') which (a) defaulted to
            // localhost:3000 in production → ECONNREFUSED, and (b) required a
            // logged-in user session that a background job doesn't have → 401.
            // Calling dialSip() here avoids both problems entirely.
            const { roomName, sipCallId } = await dialSip({
              toNumber: lead.phone,
              userId: dialUserId || "",
              agentType,
              voiceId,
              systemPrompt,
            });
            console.log(`LeadCapture: Voice -> ${lead.phone} dialed room=${roomName} sip=${sipCallId}`);

            // Best-effort call-log record (non-critical; column/owner may be absent).
            if (dialUserId) {
              try {
                const { data: callRecord } = await supabase
                  .from("voice_calls")
                  .insert({
                    user_id: dialUserId,
                    to_number: lead.phone,
                    agent_type: agentType,
                    voice_id: voiceId,
                    status: "ringing",
                    livekit_room_name: roomName,
                    livekit_sip_call_id: sipCallId,
                  })
                  .select("id")
                  .single();
                if (callRecord?.id) {
                  startEgressRecording(roomName, callRecord.id).catch((err) =>
                    console.error("LeadCapture: egress recording failed:", err)
                  );
                }
              } catch (recErr) {
                console.warn("LeadCapture: could not write voice_calls record:", recErr);
              }
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

        // 5. Best-effort per-channel breakdown for the frontend activity panel.
        // Requires the `channel_status` column (see migration-lead-capture-channel-status.sql).
        // If the column isn't present yet, this update is ignored and the core
        // status update above still stands — so the workflow never breaks.
        const channelStatus = {
          whatsapp: hasWhatsAppTask ? (waSent ? "sent" : "failed") : "disabled",
          whatsapp_error: hasWhatsAppTask && !waSent ? waError || "unknown" : null,
          email: setting.email_enabled
            ? hasEmailTask
              ? emailSent
                ? "sent"
                : "failed"
              : "no_email"
            : "disabled",
          email_error: hasEmailTask && !emailSent ? emailError || "unknown" : null,
          voice: hasVoiceTask ? (voiceSent ? "sent" : "failed") : "disabled",
          voice_error: hasVoiceTask && !voiceSent ? voiceError || "unknown" : null,
          updated_at: new Date().toISOString(),
        };
        const { error: csErr } = await supabase
          .from("lead_capture_leads")
          .update({ channel_status: channelStatus })
          .eq("id", lead.id);
        if (csErr) {
          console.warn(
            `LeadCapture: channel_status not saved (run migration-lead-capture-channel-status.sql): ${csErr.message}`
          );
        }

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
