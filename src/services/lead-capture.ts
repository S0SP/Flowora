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

// Helper to replace placeholders like {Interest} or {{Interest}} dynamically from custom variables
export function interpolateCustomFields(text: string, customFields: Record<string, any> = {}, lead: any): string {
  if (!text) return "";
  let result = text
    .replace(/\{\{lead_name\}\}/g, lead.name || "friend")
    .replace(/\{\{lead_email\}\}/g, lead.email || "")
    .replace(/\{\{lead_phone\}\}/g, lead.phone || "")
    .replace(/\{lead_name\}/g, lead.name || "friend")
    .replace(/\{lead_email\}/g, lead.email || "")
    .replace(/\{lead_phone\}/g, lead.phone || "");

  Object.entries(customFields).forEach(([key, value]) => {
    const cleanValue = value !== undefined && value !== null ? String(value) : "";
    
    // Replace {{key}}
    const regexDouble = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
    result = result.replace(regexDouble, cleanValue);

    // Replace {key}
    const regexSingle = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(regexSingle, cleanValue);
  });

  return result;
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

// 1. Sync active Google Sheets into the queue
export async function syncActiveSheets() {
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

          // Extract all custom variables (any columns other than name, phone, email columns)
          const customFields: Record<string, any> = {};
          const standardCols = [
            setting.phone_column?.toLowerCase(), 
            setting.name_column?.toLowerCase(), 
            setting.email_column?.toLowerCase()
          ].filter(Boolean);

          Object.entries(row).forEach(([key, val]) => {
            if (!standardCols.includes(key.toLowerCase())) {
              customFields[key] = val?.trim();
            }
          });

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
            channel_status: {
              custom_fields: customFields
            }
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
  }
}

// 2. Process and send pending messages
export async function sendPendingLeads() {
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
        const customFields = lead.channel_status?.custom_fields || {};
        const { data: upsertedContact, error: contactError } = await supabase
          .from("contacts")
          .upsert(
            { 
              phone: lead.phone, 
              name: lead.name, 
              full_name: lead.name, 
              email: lead.email, 
              custom_fields: customFields,
              last_message_at: new Date().toISOString() 
            },
            { onConflict: "phone" }
          )
          .select("id")
          .single();

        if (contactError || !upsertedContact) {
          throw new Error(contactError?.message ?? "Failed to upsert contact");
        }

        // Auto-create lead row in New Lead stage
        try {
          const { data: pipeline } = await supabase
            .from("pipelines")
            .select("id")
            .eq("workspace_id", lead.workspace_id)
            .eq("is_default", true)
            .single();

          const { data: stage } = await supabase
            .from("pipeline_stages")
            .select("id")
            .eq("workspace_id", lead.workspace_id)
            .eq("name", "New Lead")
            .limit(1)
            .single();

          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("workspace_id", lead.workspace_id)
            .eq("contact_id", upsertedContact.id)
            .maybeSingle();

          if (!existingLead) {
            await supabase
              .from("leads")
              .insert({
                workspace_id: lead.workspace_id,
                contact_id: upsertedContact.id,
                pipeline_id: pipeline?.id || null,
                stage_id: stage?.id || null,
                status: "new",
                value: 0,
              });
          }
        } catch (leadAutoErr) {
          console.error("LeadCapture: failed to auto-create lead row:", leadAutoErr);
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
            // Fetch SMTP from channel_connections
            const { data: smtpConn } = await supabase
              .from("channel_connections")
              .select("config")
              .eq("workspace_id", lead.workspace_id)
              .eq("type", "smtp")
              .maybeSingle();

            const smtpConfig = (smtpConn?.config as any) || {};
            const smtpHost = smtpConfig.host;
            const smtpPort = smtpConfig.port;
            const smtpUser = smtpConfig.user;
            const smtpPassword = smtpConfig.password; // Assuming securely stored or decrypted elsewhere in a real prod app, but matching current config usage

            if (!smtpHost || !smtpUser || !smtpPassword) {
              throw new Error("SMTP credentials not configured in workspace settings");
            }

            const emailHtml = compileEmailTemplate(
              setting.email_template_id || "welcome",
              {
                brand_name: setting.email_brand_name,
                logo_url: setting.email_logo_url,
                title: interpolateCustomFields(setting.email_title || "", customFields, lead),
                body: interpolateCustomFields(setting.email_body || "", customFields, lead),
                button_text: setting.email_button_text,
                button_url: setting.email_button_url,
                footer: interpolateCustomFields(setting.email_footer || "", customFields, lead),
              },
              {
                name: lead.name,
                email: lead.email,
                phone: lead.phone,
              }
            );

            await sendMail(
              {
                smtp_host: smtpHost,
                smtp_port: smtpPort || 587,
                smtp_user: smtpUser,
                smtp_password: smtpPassword,
                email_from_name: setting.email_from_name || smtpConfig.fromName,
                email_from: setting.email_from || smtpConfig.fromEmail || smtpUser,
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
            const systemPrompt = setting.voice_prompt
              ? interpolateCustomFields(setting.voice_prompt, customFields, lead)
              : `You are an AI assistant for ${brandName}. You are calling a new lead named ${lead.name || "friend"}. Be helpful and answer their questions.`;

            const agentType: "livekit" | "gemini" =
              setting.voice_agent_type === "gemini" ? "gemini" : "livekit";
            const voiceId = setting.voice_id || "anushka";

            // Place outbound call via Dograh Backend API
            const dograhUrl = process.env.DOGRAH_API_URL || "http://localhost:8000";
            const flowraSecret = process.env.DOGRAH_SECRET || "change-me-in-production";
            const dograhWorkflowId = parseInt(process.env.DOGRAH_WORKFLOW_ID || "1", 10);

            const initialContext = {
              system_prompt: systemPrompt || "",
              first_message: "",
              model_overrides: {
                tts: {
                  provider: agentType === "gemini" ? "google" : "sarvam",
                  voice: voiceId,
                  language: setting.sarvam_language || "hi-IN",
                },
                llm: {
                  provider: agentType === "gemini" ? "google" : "groq",
                  model: agentType === "gemini" ? "gemini-2.0-flash-exp" : "llama-3.3-70b-versatile",
                },
              },
            };

            const dograhRes = await fetch(`${dograhUrl}/api/v1/telephony/initiate-call`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Flowra-Secret": flowraSecret,
              },
              body: JSON.stringify({
                workflow_id: dograhWorkflowId,
                phone_number: lead.phone,
                initial_context: initialContext,
              }),
            });

            if (!dograhRes.ok) {
              const errText = await dograhRes.text();
              throw new Error(`Dograh API error: ${errText}`);
            }

            const dograhData = await dograhRes.json();
            const roomName = `run-${dograhData.workflow_run_id}`;
            const sipCallId = String(dograhData.workflow_run_id);
            console.log(`LeadCapture: Voice -> ${lead.phone} dialed Dograh run=${roomName}`);

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

        // Auto-update lead row status to "contacted" if contacted
        if (waSent || emailSent || voiceSent) {
          try {
            const { data: contactedStage } = await supabase
              .from("pipeline_stages")
              .select("id")
              .eq("workspace_id", lead.workspace_id)
              .eq("name", "Contacted")
              .limit(1)
              .single();

            await supabase
              .from("leads")
              .update({
                status: "contacted",
                stage_id: contactedStage?.id || null,
              })
              .eq("workspace_id", lead.workspace_id)
              .eq("contact_id", upsertedContact.id);
          } catch (autoContactErr) {
            console.error("LeadCapture: failed to auto-transition lead to contacted:", autoContactErr);
          }
        }

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
  }
}
