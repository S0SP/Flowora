"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Settings2,
  Play,
  Pause,
  Loader2,
  HelpCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
  Clock,
  Link as LinkIcon,
  Mail,
  MessageSquare,
  Layout,
  Info,
  Server,
  Smartphone,
  Monitor,
  Mic,
  Brain,
  Headphones,
  Activity,
  Volume2,
  Eye
} from "lucide-react";
import { WhatsAppTemplate } from "@/types";
import { formatDate, cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/custom-select";

// Zod schema matching database migrations
const schema = z.object({
  sheet_url: z.string().url("Must be a valid URL (e.g. https://docs.google.com/spreadsheets/...)"),
  phone_column: z.string().min(1, "Phone column name is required"),
  name_column: z.string().optional().nullable(),
  email_column: z.string().optional().nullable(),
  template_name: z.string().optional().nullable(),
  template_language: z.string().optional().nullable(),
  delay_minutes: z.coerce.number().min(0, "Delay must be 0 or more minutes"),
  is_active: z.boolean().default(false),
  whatsapp_enabled: z.boolean().default(true),
  email_enabled: z.boolean().default(false),
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.coerce.number().optional().nullable(),
  smtp_user: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  email_from_name: z.string().optional().nullable(),
  email_from: z.string().optional().nullable(),
  email_subject: z.string().optional().nullable(),
  email_template_id: z.string().default("welcome"),
  email_logo_url: z.string().optional().nullable(),
  email_brand_name: z.string().optional().nullable(),
  email_title: z.string().optional().nullable(),
  email_body: z.string().optional().nullable(),
  email_button_text: z.string().optional().nullable(),
  email_button_url: z.string().optional().nullable(),
  email_footer: z.string().optional().nullable(),
  voice_enabled: z.boolean().default(false),
  voice_agent_type: z.string().default("livekit"),
  voice_id: z.string().default("anushka"),
  voice_prompt: z.string().optional().nullable(),
  custom_columns: z.any().optional().nullable(),
});

type FormData = z.infer<typeof schema>;

type ChannelState = "sent" | "failed" | "disabled" | "no_email";

interface ChannelStatus {
  whatsapp?: ChannelState;
  whatsapp_error?: string | null;
  email?: ChannelState;
  email_error?: string | null;
  voice?: ChannelState;
  voice_error?: string | null;
  updated_at?: string;
  custom_fields?: Record<string, any>;
}

interface Lead {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: "pending" | "processing" | "sent" | "failed";
  scheduled_for: string;
  processed_at: string | null;
  error_message: string | null;
  channel_status: ChannelStatus | null;
  created_at: string;
}

interface ActivityEntry {
  ts: string;
  kind: "info" | "success" | "error" | "sync";
  message: string;
}

// Voice catalogs — kept in sync with the voice worker (voice-worker/agent.py).
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SARVAM_VOICES = [
  {
    label: "Sarvam v2 (classic)",
    voices: ["anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"].map((id) => ({ id, name: cap(id) })),
  },
  {
    label: "Sarvam v3 (newest, most natural)",
    voices: [
      "ritu", "pooja", "simran", "kavya", "ishita", "shreya", "priya",
      "shubh", "rahul", "amit", "ratan", "rohan", "dev", "manan", "sumit",
      "aditya", "kabir", "neha", "varun", "roopa", "aayan", "ashutosh", "advait",
      "amelia", "sophia",
    ].map((id) => ({ id, name: cap(id) })),
  },
];
const GEMINI_VOICES = [
  {
    label: "Gemini Live voices",
    voices: [
      "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe",
      "Autonoe", "Enceladus", "Iocaste", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib",
      "Rasalghul", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima",
      "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sulafat", "Sadaltager"
    ].map((id) => ({ id, name: id })),
  },
];

// 6 Premade templates mirrored locally for client state prefilling and preview compilation
const PREMADE_EMAIL_TEMPLATES = [
  {
    id: "welcome",
    name: "Ebook & Lead Magnet Delivery",
    defaultSubject: "Your Free Ebook is ready! 📚",
    defaultTitle: "Here is your free download",
    defaultBody: "Hi {{lead_name}},\n\nThank you for requesting our guide! We're excited for you to read it. It is packed with actionable insights that you can implement right away.\n\nClick the button below to download your copy immediately. Let us know what you think!",
    defaultButtonText: "Download Free Guide",
    defaultButtonUrl: "https://yourdomain.com/downloads/guide.pdf",
    themeColor: "#10b981",
  },
  {
    id: "consultation",
    name: "Book a Consultation Call",
    defaultSubject: "Let's connect! Schedule your 15-minute call 📞",
    defaultTitle: "Let's discuss your goals",
    defaultBody: "Hi {{lead_name}},\n\nThanks for reaching out! We received your details. I would love to learn more about your business goals and see how we can help you accelerate growth.\n\nPlease pick a convenient time on my calendar for a quick 15-minute introductory call using the button below.",
    defaultButtonText: "Schedule Call on Calendly",
    defaultButtonUrl: "https://calendly.com/your-username/15min",
    themeColor: "#3b82f6",
  },
  {
    id: "offer",
    name: "Special Discount / Offer",
    defaultSubject: "Exclusive Offer: 20% OFF inside! 🎉",
    defaultTitle: "Special discount just for you",
    defaultBody: "Hi {{lead_name}},\n\nWelcome to our community! To thank you for joining, we're giving you an exclusive 20% discount on your first purchase.\n\nSimply click the button below to visit our store, and the discount will be applied automatically at checkout. Enjoy!",
    defaultButtonText: "Claim 20% Discount",
    defaultButtonUrl: "https://yourdomain.com/shop?coupon=WELCOME20",
    themeColor: "#ec4899",
  },
  {
    id: "demo",
    name: "Product Demo & Activation",
    defaultSubject: "Access granted: Your demo account is ready! 🚀",
    defaultTitle: "Welcome to your new dashboard",
    defaultBody: "Hi {{lead_name}},\n\nYour account has been provisioned! You now have full access to our premium suite. Here are your next steps:\n\n1. Click the button below to log in.\n2. Follow the 3-step setup wizard.\n3. Import your first dataset.\n\nLet us know if you need help getting started!",
    defaultButtonText: "Log In to Dashboard",
    defaultButtonUrl: "https://dashboard.yourdomain.com/login",
    themeColor: "#8b5cf6",
  },
  {
    id: "confirmation",
    name: "General Lead Confirmation",
    defaultSubject: "We received your request! We'll be in touch 🤝",
    defaultTitle: "Thank you for reaching out",
    defaultBody: "Hi {{lead_name}},\n\nThis is to confirm we received your request. Our team of digital marketing experts is reviewing your information right now.\n\nOne of our account managers will contact you within the next 24 business hours to discuss your project in detail. Talk soon!",
    defaultButtonText: "Visit Our Website",
    defaultButtonUrl: "https://yourdomain.com",
    themeColor: "#14b8a6",
  },
  {
    id: "invitation",
    name: "Webinar / Event Invitation",
    defaultSubject: "You're invited: Join our live training session 🎙️",
    defaultTitle: "Reserve your spot today",
    defaultBody: "Hi {{lead_name}},\n\nWe are hosting a live training session on how to build high-converting lead pipelines. Space is strictly limited to 100 participants.\n\nClick the button below to confirm your registration and add the event to your calendar.",
    defaultButtonText: "Reserve My Seat",
    defaultButtonUrl: "https://yourdomain.com/webinar/register",
    themeColor: "#f59e0b",
  },
];

// Helper to compile email HTML client-side for live preview (safely avoiding server-only modules)
function compileEmailPreviewHtml(
  templateId: string,
  variables: {
    brand_name?: string | null;
    logo_url?: string | null;
    title?: string | null;
    body?: string | null;
    button_text?: string | null;
    button_url?: string | null;
    footer?: string | null;
  },
  lead: { name: string; email: string; phone: string }
): string {
  const template = PREMADE_EMAIL_TEMPLATES.find((t) => t.id === templateId) || PREMADE_EMAIL_TEMPLATES[0];
  const color = template.themeColor;

  const brandName = variables.brand_name || "My Agency";
  const logoHtml = variables.logo_url
    ? `<img src="${variables.logo_url}" alt="${brandName}" style="max-height: 40px; max-width: 160px; display: block; margin: 0 auto;" />`
    : `<span style="font-size: 18px; font-weight: bold; color: #1e293b;">${brandName}</span>`;

  const replacePlaceholders = (text: string | null | undefined, defaultValue: string): string => {
    const val = text || defaultValue;
    return val
      .replace(/\{\{lead_name\}\}/g, lead.name)
      .replace(/\{\{lead_email\}\}/g, lead.email)
      .replace(/\{\{lead_phone\}\}/g, lead.phone)
      .replace(/\{\{brand_name\}\}/g, brandName);
  };

  const title = replacePlaceholders(variables.title, template.defaultTitle);
  const bodyText = replacePlaceholders(variables.body, template.defaultBody);
  const buttonText = replacePlaceholders(variables.button_text, template.defaultButtonText);
  const buttonUrl = replacePlaceholders(variables.button_url, template.defaultButtonUrl);
  const footerText = replacePlaceholders(variables.footer, `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`);

  const bodyHtml = bodyText.replace(/\n/g, "<br />");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { margin: 0; padding: 20px; background-color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
        .wrapper { max-width: 100%; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
        .header { padding: 20px; border-bottom: 1px solid #f1f5f9; text-align: center; }
        .accent { height: 3px; background-color: ${color}; }
        .content { padding: 30px 20px; text-align: left; }
        .title { margin: 0 0 15px 0; font-size: 20px; font-weight: 700; color: #0f172a; }
        .body { margin: 0 0 25px 0; font-size: 14px; line-height: 1.6; color: #334155; }
        .btn-wrapper { display: inline-block; margin-bottom: 10px; }
        .btn { display: inline-block; padding: 10px 22px; font-size: 14px; font-weight: 600; color: #ffffff !important; text-decoration: none; border-radius: 6px; background-color: ${color}; }
        .footer { padding: 20px; font-size: 11px; color: #94a3b8; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">${logoHtml}</div>
        <div class="accent"></div>
        <div class="content">
          <h1 class="title">${title}</h1>
          <div class="body">${bodyHtml}</div>
          ${buttonText && buttonUrl ? `
            <div class="btn-wrapper">
              <a class="btn" href="${buttonUrl}" target="_blank">${buttonText}</a>
            </div>
          ` : ""}
        </div>
        <div class="footer">
          <p style="margin: 0 0 5px 0;">${footerText}</p>
          <p style="margin: 0;">If you have any questions, reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `.trim();
}

// Client-side helper to interpolate template placeholders
export function clientInterpolate(text: string, lead: Lead, brandName?: string): string {
  if (!text) return "";
  const customFields = lead.channel_status?.custom_fields || {};
  const currentEmailBrandName = brandName || "My Agency";

  let result = text
    .replace(/\{\{lead_name\}\}/g, lead.name || "friend")
    .replace(/\{\{lead_email\}\}/g, lead.email || "")
    .replace(/\{\{lead_phone\}\}/g, lead.phone || "")
    .replace(/\{lead_name\}/g, lead.name || "friend")
    .replace(/\{lead_email\}/g, lead.email || "")
    .replace(/\{lead_phone\}/g, lead.phone || "")
    .replace(/\{\{brand_name\}\}/g, currentEmailBrandName)
    .replace(/\{brand_name\}/g, currentEmailBrandName);

  Object.entries(customFields).forEach(([key, value]) => {
    const cleanValue = value !== undefined && value !== null ? String(value) : "";

    const regexDouble = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
    result = result.replace(regexDouble, cleanValue);

    const regexSingle = new RegExp(`\\{${key}\\}`, "gi");
    result = result.replace(regexSingle, cleanValue);
  });

  return result;
}

export function LeadCaptureClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"sheet" | "whatsapp" | "smtp" | "email_template" | "voice">("sheet");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [capturedLeads, setCapturedLeads] = useState<Lead[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Live activity feed (derived from polling the leads queue)
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);
  const [previewTab, setPreviewTab] = useState<"whatsapp" | "email" | "voice">("whatsapp");
  const prevLeadsRef = useRef<Map<string, Lead> | null>(null);

  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await fetch("/api/voice/agents");
        if (res.ok) {
          const data = await res.json();
          if (data?.agents) setPresets(data.agents);
        }
      } catch (e) {
        console.error("Failed to load presets", e);
      }
    }
    loadPresets();
  }, []);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setValue("voice_agent_type", preset.agent_type);
      setValue("voice_id", preset.voice_id);
      setValue("voice_prompt", preset.system_prompt);
      toast.success(`Loaded voice preset: ${preset.name} ✓`);
    }
  };

  // Play micro synth sound using Web Audio API
  const playTestSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.1); // A5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22); // D6
      gain2.gain.setValueAtTime(0.15, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.25);
    } catch (e) {
      console.error(e);
    }
  };

  const pushActivity = (entries: ActivityEntry[]) => {
    if (entries.length === 0) return;
    setActivity((prev) => [...entries, ...prev].slice(0, 120));
  };

  const { register, handleSubmit, watch, setValue, getValues, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone_column: "phone",
      name_column: "name",
      email_column: "email",
      template_language: "en",
      delay_minutes: 0,
      is_active: false,
      whatsapp_enabled: true,
      email_enabled: false,
      smtp_port: 587,
      email_template_id: "welcome",
      email_brand_name: "My Agency",
      email_subject: "Thank you for reaching out! 📚",
      email_title: "Here is your free download",
      email_body: "Hi {{lead_name}},\n\nThank you for requesting our guide! We're excited for you to read it. It is packed with actionable insights that you can implement right away.\n\nClick the button below to download your copy immediately. Let us know what you think!",
      email_button_text: "Download Free Guide",
      email_button_url: "https://yourdomain.com/downloads/guide.pdf",
      voice_enabled: false,
      voice_agent_type: "livekit",
      voice_id: "anushka",
      voice_prompt: "You are an AI assistant for {{brand_name}}. You are calling a new lead named {{lead_name}}. Be helpful, keep it short, and remind them to check their email/whatsapp.",
    },
  });

  const isActive = watch("is_active");
  const whatsappEnabled = watch("whatsapp_enabled");
  const emailEnabled = watch("email_enabled");
  const voiceEnabled = watch("voice_enabled");
  const voiceAgentType = watch("voice_agent_type");
  const selectedEmailTemplateId = watch("email_template_id");
  const delayMinutes = watch("delay_minutes");
  const sheetUrl = watch("sheet_url");
  const customColumns = watch("custom_columns");
  const [fetchingHeaders, setFetchingHeaders] = useState(false);

  const fetchHeaders = async () => {
    if (!sheetUrl) {
      toast.error("Please enter a Google Sheet URL first");
      return;
    }
    setFetchingHeaders(true);
    try {
      const res = await fetch(`/api/workflows/fetch-sheet-headers?url=${encodeURIComponent(sheetUrl)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to fetch columns");
      
      const cols = d.headers ?? [];
      setValue("custom_columns", cols, { shouldDirty: true });
      
      const lowerCols = cols.map((c: string) => c.toLowerCase());
      const phoneIdx = lowerCols.findIndex((c: string) => c.includes("phone") || c.includes("mobile") || c.includes("whatsapp") || c.includes("number"));
      const nameIdx = lowerCols.findIndex((c: string) => c.includes("name") || c.includes("full") || c.includes("lead"));
      const emailIdx = lowerCols.findIndex((c: string) => c.includes("email") || c.includes("mail"));
      
      if (phoneIdx !== -1) setValue("phone_column", cols[phoneIdx], { shouldDirty: true });
      if (nameIdx !== -1) setValue("name_column", cols[nameIdx], { shouldDirty: true });
      if (emailIdx !== -1) setValue("email_column", cols[emailIdx], { shouldDirty: true });
      
      toast.success(`Successfully fetched ${cols.length} column headers!`);
    } catch (err: any) {
      toast.error(err.message || "An error occurred while fetching sheet headers");
    } finally {
      setFetchingHeaders(false);
    }
  };
  const templateName = watch("template_name");

  // Watch email preview values
  const previewBrandName = watch("email_brand_name");
  const previewLogoUrl = watch("email_logo_url");
  const previewTitle = watch("email_title");
  const previewBody = watch("email_body");
  const previewButtonText = watch("email_button_text");
  const previewButtonUrl = watch("email_button_url");
  const previewFooter = watch("email_footer");

  // Fetch WhatsApp templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data);
    } catch {
      toast.error("Could not load WhatsApp templates.");
      setTemplates([{ name: "hello_world", language: "en_US", display_name: "Hello World" }]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Fetch settings & lead history logs
  const fetchSettingsAndLeads = async (showToast = false, isPolling = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await fetch("/api/lead-capture");
      if (!res.ok) throw new Error("Failed to load settings");
      const { settings, leads } = await res.json();

      if (settings) {
        setSettingsId(settings.id);
        if (!isPolling) {
          reset({
            sheet_url: settings.sheet_url,
            phone_column: settings.phone_column,
            name_column: settings.name_column,
            email_column: settings.email_column,
            template_name: settings.template_name,
            template_language: settings.template_language,
            delay_minutes: settings.delay_minutes,
            is_active: settings.is_active,
            whatsapp_enabled: settings.whatsapp_enabled !== false,
            email_enabled: !!settings.email_enabled,
            smtp_host: settings.smtp_host,
            smtp_port: settings.smtp_port || 587,
            smtp_user: settings.smtp_user,
            smtp_password: settings.smtp_password,
            email_from_name: settings.email_from_name,
            email_from: settings.email_from,
            email_subject: settings.email_subject,
            email_template_id: settings.email_template_id || "welcome",
            email_logo_url: settings.email_logo_url,
            email_brand_name: settings.email_brand_name || "My Agency",
            email_title: settings.email_title,
            email_body: settings.email_body,
            email_button_text: settings.email_button_text,
            email_button_url: settings.email_button_url,
            email_footer: settings.email_footer,
            voice_enabled: settings.voice_enabled ?? false,
            voice_agent_type: settings.voice_agent_type ?? "livekit",
            voice_id: settings.voice_id ?? "anushka",
            voice_prompt: settings.voice_prompt ?? "",
            custom_columns: settings.custom_columns ?? [],
          });
        }
      }
      const freshLeads: Lead[] = leads || [];

      // Diff against the previous poll to build a live activity feed.
      const now = new Date();
      const time = now.toLocaleTimeString();
      const prevMap = prevLeadsRef.current;
      const newEntries: ActivityEntry[] = [];

      if (prevMap === null) {
        // First load — seed without flooding the feed.
        newEntries.push({
          ts: time,
          kind: "sync",
          message: `Loaded ${freshLeads.length} captured lead${freshLeads.length === 1 ? "" : "s"} from queue.`,
        });
      } else {
        for (const lead of freshLeads) {
          const old = prevMap.get(lead.id);
          const who = lead.name || lead.phone;
          if (!old) {
            newEntries.push({ ts: time, kind: "info", message: `New lead queued → ${who}` });
          } else if (old.status !== lead.status) {
            if (lead.status === "processing") {
              newEntries.push({ ts: time, kind: "info", message: `Processing channels → ${who}` });
            } else if (lead.status === "sent") {
              newEntries.push({ ts: time, kind: "success", message: `Delivered → ${who}` });
            } else if (lead.status === "failed") {
              newEntries.push({ ts: time, kind: "error", message: `Failed → ${who}: ${lead.error_message || "unknown error"}` });
            }
          }
        }
      }

      pushActivity(newEntries);
      prevLeadsRef.current = new Map(freshLeads.map((l) => [l.id, l]));
      setLastSynced(now);
      setCapturedLeads(freshLeads);
      if (showToast) toast.success("Data refreshed");
    } catch (err) {
      console.error("LeadCapture: fetch failed:", err);
      toast.error("Failed to load automation settings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchSettingsAndLeads();
  }, []);

  // Live polling: while the page is open, kick the queue processor and then
  // refresh, every 10s — so progress shows in near real time without waiting
  // for the server cron. The processor has its own overlap locks, so this is safe.
  useEffect(() => {
    if (!autoRefresh) return;
    const tick = async () => {
      try {
        await fetch("/api/campaigns/process-queue", { method: "POST" });
      } catch {
        // Non-fatal — the server cron is the source of truth; this is just a nudge.
      }
      fetchSettingsAndLeads(false, true);
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  // Preset Template loader
  const handleApplyPresetTemplate = (templateId: string) => {
    const t = PREMADE_EMAIL_TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setValue("email_template_id", t.id);
    setValue("email_subject", t.defaultSubject);
    setValue("email_title", t.defaultTitle);
    setValue("email_body", t.defaultBody);
    setValue("email_button_text", t.defaultButtonText);
    setValue("email_button_url", t.defaultButtonUrl);
    toast.success(`Loaded "${t.name}" pre-made layout!`);
  };

  // Submit Settings Update
  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: settingsId,
          ...data,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save configuration");
      }

      const resData = await res.json();
      if (resData.settings) {
        setSettingsId(resData.settings.id);
      }

      toast.success(
        data.is_active
          ? "Automation active! Google Sheet is now sync-polling..."
          : "Draft settings saved successfully."
      );

      setTimeout(() => fetchSettingsAndLeads(), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const onError = (errors: any) => {
    const errorFields = Object.keys(errors);
    if (errorFields.length > 0) {
      toast.error("Please fix the highlighted errors before activating.");

      const sheetFields = ["sheet_url", "phone_column", "name_column", "email_column", "delay_minutes"];
      const whatsappFields = ["template_name", "template_language"];
      const emailFields = ["email_subject", "email_logo_url", "email_brand_name", "email_title", "email_body", "email_button_text", "email_button_url", "email_footer"];
      const voiceFields = ["voice_agent_type", "voice_id", "voice_prompt"];

      const firstError = errorFields[0];
      if (sheetFields.includes(firstError)) setActiveTab("sheet");
      else if (whatsappFields.includes(firstError)) setActiveTab("whatsapp");
      else if (emailFields.includes(firstError)) setActiveTab("email_template");
      else if (voiceFields.includes(firstError)) setActiveTab("voice");
    }
  };

  const hasError = (fields: string[]) => fields.some(f => errors[f as keyof typeof errors]);

  // One-click pause/resume — flips is_active and persists immediately,
  // without needing a full form re-save.
  const toggleAutomation = async () => {
    if (!settingsId) {
      toast.error("Save your configuration first, then you can pause/resume it.");
      return;
    }
    const next = !isActive;
    setToggling(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...getValues(), id: settingsId, is_active: next }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to update automation status");
      }
      setValue("is_active", next);
      pushActivity([
        {
          ts: new Date().toLocaleTimeString(),
          kind: next ? "success" : "info",
          message: next ? "Automation resumed — polling Google Sheet" : "Automation paused — sheet polling stopped",
        },
      ]);
      toast.success(next ? "Automation resumed" : "Automation paused");
      fetchSettingsAndLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setToggling(false);
    }
  };

  const getStatusBadge = (status: Lead["status"]) => {
    const badges = {
      pending: { label: "Pending", class: "bg-amber-500/10 text-amber-500 border-amber-500/20", icon: Clock },
      processing: { label: "Processing", class: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Loader2 },
      sent: { label: "Completed", class: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
      failed: { label: "Failed", class: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.class}`}>
        <Icon className={`w-3.5 h-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
        {badge.label}
      </span>
    );
  };

  // Per-channel delivery chip for the captured-leads breakdown
  const ChannelChip = ({
    icon: Icon,
    label,
    state,
    error,
  }: {
    icon: typeof MessageSquare;
    label: string;
    state?: ChannelState;
    error?: string | null;
  }) => {
    if (!state || state === "disabled") return null;
    const styles: Record<string, string> = {
      sent: "bg-primary/10 text-primary border-primary/20",
      failed: "bg-destructive/10 text-destructive border-destructive/20",
      no_email: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    };
    const labels: Record<string, string> = { sent: "OK", failed: "Fail", no_email: "No addr" };
    const title = error || `${label}: ${labels[state] || state}`;
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${styles[state] || "bg-gray-100 text-gray-500 border-border"}`}
      >
        <Icon className="w-3 h-3" />
        {label} · {labels[state] || state}
      </span>
    );
  };

  const renderChannelBreakdown = (lead: Lead) => {
    const cs = lead.channel_status;
    if (!cs) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
        <ChannelChip icon={MessageSquare} label="WA" state={cs.whatsapp} error={cs.whatsapp_error} />
        <ChannelChip icon={Mail} label="Email" state={cs.email} error={cs.email_error} />
        <ChannelChip icon={Headphones} label="Voice" state={cs.voice} error={cs.voice_error} />
      </div>
    );
  };

  // Compile real-time preview document
  const previewHtml = compileEmailPreviewHtml(
    selectedEmailTemplateId,
    {
      brand_name: previewBrandName,
      logo_url: previewLogoUrl,
      title: previewTitle,
      body: previewBody,
      button_text: previewButtonText,
      button_url: previewButtonUrl,
      footer: previewFooter,
    },
    {
      name: "John Doe",
      email: "john.doe@example.com",
      phone: "+91 70032 49959",
    }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* SECTION 2: WORKFLOW CONFIGURATION & CAPTURED LEADS LIST */}
      <div className="flex flex-1 min-h-0 w-full relative border border-border dark:border-[#27272A] rounded-2xl shadow-sm overflow-hidden bg-white dark:bg-[#111114]">

        {/* Left Column (Config) */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-8 py-6">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-border dark:border-[#27272A] pb-3">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Configure Workflows</h3>
            </div>

            {/* Tab navigation buttons */}
            {/* Tab navigation buttons */}
            <div className="flex flex-wrap bg-gray-100/40 dark:bg-white/5 p-1 rounded-xl mb-4 border border-border/50 dark:border-[#27272A] text-[11px] font-medium gap-1">
              <button
                onClick={() => setActiveTab("sheet")}
                type="button"
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${activeTab === "sheet" ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-semibold" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                Sheet Config
                {hasError(["sheet_url", "phone_column", "name_column", "email_column", "delay_minutes"]) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute top-1.5 right-1.5" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("whatsapp")}
                type="button"
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${activeTab === "whatsapp" ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-semibold" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                WhatsApp
                {hasError(["template_name", "template_language"]) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute top-1.5 right-1.5" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("smtp")}
                type="button"
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${activeTab === "smtp" ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-semibold" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <Server className="w-3.5 h-3.5 text-amber-500" />
                SMTP Setup
              </button>
              <button
                onClick={() => setActiveTab("email_template")}
                type="button"
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${activeTab === "email_template" ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-semibold" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <Layout className="w-3.5 h-3.5 text-pink-500" />
                Email Builder
                {hasError(["email_subject", "email_logo_url", "email_brand_name", "email_title", "email_body", "email_button_text", "email_button_url", "email_footer"]) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute top-1.5 right-1.5" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("voice")}
                type="button"
                className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all relative ${activeTab === "voice" ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-semibold" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <Headphones className="w-3.5 h-3.5 text-purple-500" />
                Voice Agent
                {hasError(["voice_agent_type", "voice_id", "voice_prompt"]) && (
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute top-1.5 right-1.5" />
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-4">

              {/* TAB 1: Sheet & Columns */}
              {activeTab === "sheet" && (
                <div className="animate-fade-in space-y-4">
                  {/* How To Share Sheet Accordion */}
                  <details className="group border border-gray-200 dark:border-[#27272A] rounded-lg bg-gray-50/50 dark:bg-white/5 open:bg-gray-50 dark:open:bg-white/10 transition-colors">
                    <summary className="flex items-center cursor-pointer p-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      <HelpCircle className="w-4 h-4 text-primary mr-2" />
                      How to share your Google Sheet correctly
                      <span className="ml-auto text-gray-500 dark:text-gray-400 group-open:rotate-180 transition-transform">
                        ▼
                      </span>
                    </summary>
                    <div className="p-4 pt-0 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-[#27272A] mt-2">
                      <ol className="list-decimal pl-4 space-y-1.5">
                        <li>Open your Google Sheet.</li>
                        <li>Click the <strong>Share</strong> button in the top-right corner.</li>
                        <li>Under <strong>General Access</strong>, change Restricted to:
                          <span className="font-medium text-gray-900 dark:text-white block mt-0.5">"Anyone with the link can view"</span>
                        </li>
                        <li>Copy the full browser URL and paste it in the config form below.</li>
                      </ol>
                    </div>
                  </details>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Google Sheet URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        {...register("sheet_url")}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="flex-1 px-3 py-2.5 bg-white border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button 
                        type="button" 
                        onClick={fetchHeaders} 
                        disabled={fetchingHeaders} 
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-colors"
                      >
                        {fetchingHeaders ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch Columns"}
                      </button>
                    </div>
                    {errors.sheet_url && (
                      <p className="text-xs text-destructive">{errors.sheet_url.message}</p>
                    )}
                  </div>
                  
                  {customColumns && Array.isArray(customColumns) && customColumns.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Detected Column Variables</label>
                      <div className="flex flex-wrap gap-1.5 bg-gray-100/40 border border-border rounded-lg p-2.5 max-h-32 overflow-y-auto">
                        {customColumns.map((h: string) => (
                          <span key={h} className="px-2 py-1 bg-white border border-border rounded text-[11px] font-medium text-gray-600 shadow-sm">
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-100/30 rounded-xl p-3 border border-border/50 space-y-3">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block">
                      Column Headers mapping
                    </span>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-gray-900 font-medium">Phone Header:</span>
                      <input
                        {...register("phone_column")}
                        placeholder="e.g. phone"
                        className="col-span-2 px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {errors.phone_column && (
                      <p className="text-xs text-destructive">{errors.phone_column.message}</p>
                    )}

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-gray-500">Name Header:</span>
                      <input
                        {...register("name_column")}
                        placeholder="e.g. name"
                        className="col-span-2 px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-gray-500">Email Header:</span>
                      <input
                        {...register("email_column")}
                        placeholder="e.g. email"
                        className="col-span-2 px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="border-t border-border/40 pt-2.5 mt-2">
                      <span className="text-[10px] text-gray-500 leading-relaxed block font-semibold">
                        💡 Auto Custom Fields: All other spreadsheet columns (e.g. Interest, Budget, Location) are automatically captured. Use them in WhatsApp templates, Email templates or Voice prompts using variables like {"{Interest}"} or {"{{Budget}}"}.
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Workflow Delay (Minutes)
                    </label>
                    <input
                      type="number"
                      {...register("delay_minutes")}
                      placeholder="0 (send immediately)"
                      className="w-full px-3 py-2.5 bg-white border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {errors.delay_minutes && (
                      <p className="text-xs text-destructive">{errors.delay_minutes.message}</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: WhatsApp Configurations */}
              {activeTab === "whatsapp" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-900">Send WhatsApp Message</span>
                      <span className="text-[10px] text-gray-500">Auto send templates on new lead</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("whatsapp_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {whatsappEnabled !== false && (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Select WhatsApp Template
                        </label>
                        {loadingTemplates ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-input rounded-xl">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                            <span className="text-xs text-gray-500">Loading templates...</span>
                          </div>
                        ) : (
                          <CustomSelect
                            value={watch("template_name") || ""}
                            onValueChange={(val: string) => {
                              const t = templates.find((t) => t.name === val);
                              setValue("template_name", val);
                              if (t) setValue("template_language", t.language);
                            }}
                            placeholder="Select a template"
                            options={templates.map((t) => ({ label: `${t.display_name} (${t.language})`, value: t.name }))}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SMTP Connection Server details */}
              {activeTab === "smtp" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-900">Send Branded SMTP Email</span>
                      <span className="text-[10px] text-gray-500">Auto send customized emails to leads</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("email_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {emailEnabled && (
                    <div className="space-y-4 pt-1">
                      <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex gap-2">
                        <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-gray-500 leading-normal">
                          <strong>Workspace SMTP Integrated:</strong> This lead capture form will automatically use the global SMTP configuration saved in your <strong>Workspace Settings &gt; Channels &gt; Email</strong>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Email Builder with split-screen real-time preview */}
              {activeTab === "email_template" && (
                <div className="animate-fade-in space-y-4">
                  {!emailEnabled ? (
                    <div className="py-8 text-center bg-gray-100/40 rounded-2xl border border-border">
                      <Layout className="w-8 h-8 text-gray-500/30 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 font-medium">Please enable SMTP Email first</p>
                      <p className="text-[10px] text-gray-500/60 max-w-[200px] mx-auto mt-1">
                        Go to the SMTP Settings tab and toggle email dispatching to design templates.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                      {/* Left Side: Form Controls */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                            Select Starter Template Preset
                          </label>
                          <CustomSelect
                            value={selectedEmailTemplateId}
                            onValueChange={(val: string) => handleApplyPresetTemplate(val)}
                            placeholder="Select a preset template"
                            options={PREMADE_EMAIL_TEMPLATES.map((tmpl) => ({ label: tmpl.name, value: tmpl.id }))}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Email Subject</label>
                          <input {...register("email_subject")} placeholder="Exclusive Offer: 20% OFF inside!" className="w-full px-3 py-2 bg-white border border-input rounded-xl text-xs focus:outline-none" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Logo Image URL</label>
                            <input {...register("email_logo_url")} placeholder="https://domain.com/logo.png" className="w-full px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Brand Name</label>
                            <input {...register("email_brand_name")} placeholder="My Agency Name" className="w-full px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Header Heading Title</label>
                          <input {...register("email_title")} placeholder="Your ebook is ready!" className="w-full px-3 py-2 bg-white border border-input rounded-xl text-xs focus:outline-none" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Email Body Message</label>
                            <div className="flex gap-1.5">
                              <span className="text-[8px] bg-gray-100 px-1 py-0.5 rounded text-gray-500 hover:bg-gray-100-foreground hover:text-white cursor-pointer" title="Inserts name dynamically" onClick={() => setValue("email_body", (previewBody || "") + " {{lead_name}}")}>{"{{lead_name}}"}</span>
                              <span className="text-[8px] bg-gray-100 px-1 py-0.5 rounded text-gray-500 hover:bg-gray-100-foreground hover:text-white cursor-pointer" title="Inserts email dynamically" onClick={() => setValue("email_body", (previewBody || "") + " {{lead_email}}")}>{"{{lead_email}}"}</span>
                            </div>
                          </div>
                          <textarea
                            {...register("email_body")}
                            rows={6}
                            placeholder="Hi {{lead_name}},\n\nThank you for choosing us..."
                            className="w-full px-3 py-2 bg-white border border-input rounded-xl text-xs focus:outline-none font-sans leading-relaxed"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">CTA Button Text</label>
                            <input {...register("email_button_text")} placeholder="Download Now" className="w-full px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">CTA Button URL</label>
                            <input {...register("email_button_url")} placeholder="https://link.com" className="w-full px-2.5 py-1.5 bg-white border border-input rounded-lg text-xs" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">Footer Text</label>
                          <input {...register("email_footer")} placeholder="© 2026 My Brand. All rights reserved." className="w-full px-3 py-2 bg-white border border-input rounded-xl text-xs focus:outline-none" />
                        </div>
                      </div>

                      {/* Right Side: Real-time Device Preview Frame */}
                      <div className="bg-gray-100 rounded-2xl p-6 flex flex-col h-[600px] border border-gray-200">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Live Email Preview</span>
                          <div className="flex bg-white p-0.5 rounded-lg border border-gray-200">
                            <button
                              onClick={() => setPreviewDevice("desktop")}
                              type="button"
                              className={`p-1 rounded ${previewDevice === "desktop" ? "bg-gray-100" : ""}`}
                            >
                              <Monitor className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPreviewDevice("mobile")}
                              type="button"
                              className={`p-1 rounded ${previewDevice === "mobile" ? "bg-gray-100" : ""}`}
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className={`flex-1 flex justify-center overflow-y-auto ${previewDevice === 'mobile' ? 'items-start' : 'items-center'}`}>
                          <div className={`bg-white shadow-lg rounded-xl overflow-hidden ${previewDevice === 'mobile' ? 'w-[320px] h-[480px]' : 'w-full h-full'}`}>
                            <iframe title="preview" srcDoc={previewHtml} className="w-full h-full border-0" />
                          </div>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: Voice Configurations */}
              {activeTab === "voice" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-900">Trigger AI Voice Call</span>
                      <span className="text-[10px] text-gray-500">Automatically call the lead with AI</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("voice_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {voiceEnabled && (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase flex items-center justify-between">
                          <span>Load Preset Settings</span>
                          {presets.length === 0 && <span className="text-[9px] font-normal text-destructive-foreground">No presets configured</span>}
                        </label>
                        <CustomSelect
                          value={selectedPresetId}
                          onValueChange={(val: string) => handleSelectPreset(val)}
                          placeholder="-- Select a Preset to Prefill --"
                          options={presets.map((p) => ({ label: `${p.name} (${p.agent_type === "gemini" ? "Gemini" : "LiveKit"})`, value: p.id }))}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Agent Engine</label>
                        <CustomSelect
                          value={watch("voice_agent_type") || "livekit"}
                          onValueChange={(val: string) => setValue("voice_agent_type", val)}
                          options={[
                            { label: "LiveKit + Sarvam TTS (Hindi/English)", value: "livekit" },
                            { label: "Gemini Live (Multilingual)", value: "gemini" }
                          ]}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">Voice</label>
                        <CustomSelect
                          value={watch("voice_id") || ""}
                          onValueChange={(val: string) => setValue("voice_id", val)}
                          placeholder="Select a voice"
                          options={(voiceAgentType === "gemini" ? GEMINI_VOICES : SARVAM_VOICES).map((group) => ({
                            label: group.label,
                            options: group.voices.map((v) => ({ label: v.name, value: v.id }))
                          }))}
                        />
                        <p className="text-[10px] text-gray-500">
                          {voiceAgentType === "gemini"
                            ? "Gemini Live multilingual voices."
                            : "Sarvam TTS voices (Hindi + English). v3 voices are the newest & most natural."}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase">
                          System Prompt (Context for the Agent)
                        </label>
                        <textarea
                          {...register("voice_prompt")}
                          rows={6}
                          placeholder="You are an AI assistant calling {{lead_name}}. Remind them about..."
                          className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-[6px] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          Available variables: <code className="font-mono bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded-[4px]">{"{{lead_name}}"}</code>, <code className="font-mono bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded-[4px]">{"{{brand_name}}"}</code>, <code className="font-mono bg-gray-100 text-gray-900 px-1.5 py-0.5 rounded-[4px]">{"{{lead_phone}}"}</code>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Automation toggle footer */}
              <div className="flex items-center justify-between p-3 bg-gray-100/40 border border-border rounded-xl mt-4">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-900">Automation Status</span>
                  <span className="text-[10px] text-gray-500 font-normal">Toggle to start sync polling</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Action Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-6 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${isActive
                      ? "bg-primary hover:bg-primary/95 text-primary-foreground"
                      : "bg-slate-800 hover:bg-slate-700 text-white"
                    }`}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isActive ? (
                    <>
                      <Play className="w-4 h-4 fill-primary-foreground" />
                      Activate Automation
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 fill-slate-300" />
                      Save Draft Settings
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column (Logs) */}
        <div className="w-[400px] border-l border-gray-200 dark:border-[#27272A] bg-gray-50/30 dark:bg-black h-full overflow-y-auto [&::-webkit-scrollbar]:hidden px-6 py-6">

          {/* Live workflow activity feed */}
          <div className="overflow-hidden flex flex-col mb-4">
            <div className="py-2 border-b border-border dark:border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${autoRefresh ? "text-primary" : "text-gray-500"}`} />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Live Activity</h3>
                {autoRefresh && (
                  <span className="flex items-center gap-1 text-[10px] text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : "Not synced"}
                </span>
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${autoRefresh
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 border-border dark:border-[#27272A]"
                    }`}
                  title="Toggle 10s auto-refresh"
                >
                  {autoRefresh ? "Auto" : "Paused"}
                </button>
              </div>
            </div>
            <div className="max-h-[220px] overflow-y-auto scrollbar-thin p-3 space-y-1.5 font-mono text-[10px] bg-gray-100/10 dark:bg-white/5 border-b border-x border-border dark:border-[#27272A] rounded-b-xl">
              {activity.length === 0 ? (
                <p className="text-gray-500/60 text-center py-6">
                  Waiting for workflow events… Activate automation and add a row to your sheet.
                </p>
              ) : (
                activity.map((entry, i) => {
                  const color =
                    entry.kind === "success"
                      ? "text-primary"
                      : entry.kind === "error"
                        ? "text-destructive"
                        : entry.kind === "sync"
                          ? "text-gray-500 dark:text-gray-400"
                          : "text-blue-500";
                  return (
                    <div key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-gray-500/50 dark:text-gray-500 shrink-0">{entry.ts}</span>
                      <span className={`${color} break-all`}>{entry.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="py-3 border-b border-border dark:border-[#27272A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Captured Lead Logs</h3>
              </div>
              <button
                onClick={() => fetchSettingsAndLeads(true)}
                disabled={refreshing}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-all"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="py-2 flex-1 max-h-[600px] overflow-y-auto space-y-3 pr-2 scrollbar-thin">
              {capturedLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileSpreadsheet className="w-10 h-10 text-gray-500/30 mb-3" />
                  <p className="text-sm font-medium text-gray-500">No leads captured yet</p>
                  <p className="text-xs text-gray-500/50 mt-1 max-w-sm">
                    Active automation will poll the Google Sheet every 30 seconds and list processed rows here.
                  </p>
                </div>
              ) : (
                capturedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-white rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="rounded-lg p-2 bg-primary/5 text-primary shrink-0 border border-primary/10">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-gray-900 flex flex-wrap items-center gap-1.5 leading-snug">
                          <span>{lead.name || "Unknown Lead"}</span>
                          {lead.status === "failed" ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-200">Failed</span>
                          ) : lead.status === "sent" ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">Success</span>
                          ) : lead.status === "processing" ? (
                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200 animate-pulse">Running</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-gray-100 text-gray-500 border border-border">In Queue</span>
                          )}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 mt-1 font-semibold">
                          <span className="font-mono">{lead.phone}</span>
                          {lead.email && <span>• {lead.email}</span>}
                          <span>• Synced {formatDate(lead.created_at)}</span>
                        </div>

                        {/* Deliveries outcome breakdown */}
                        {renderChannelBreakdown(lead)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          playTestSound();
                          setPreviewLead(lead);
                          setPreviewTab("whatsapp");
                        }}
                        className="inline-flex items-center justify-center rounded-lg text-xs font-bold border border-border bg-white hover:bg-gray-100 text-gray-500 h-8 px-3 gap-1.5 transition-all shadow-xs"
                        title="Preview Outreach Campaign Mockup"
                      >
                        <Eye className="h-3.5 w-3.5 text-primary" /> Test / Preview
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Outreach Mockup Preview Modal */}
      {previewLead && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-xs">
          <div className="bg-white w-[540px] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">Lead Campaign Preview</h3>
                <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">
                  Simulating live variables substitution for {previewLead.name || "John Doe"}
                </p>
              </div>
              <button
                onClick={() => setPreviewLead(null)}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lead detail & variables overview panel */}
            <div className="bg-gray-100/30 px-5 py-4 border-b border-border shrink-0 text-xs">
              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-gray-500 tracking-wider">Full Name</span>
                  <span className="font-semibold text-gray-900">{previewLead.name || "—"}</span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase font-bold text-gray-500 tracking-wider">Phone</span>
                  <span className="font-semibold text-gray-900 font-mono">{previewLead.phone}</span>
                </div>
                {previewLead.email && (
                  <div className="col-span-2">
                    <span className="block text-[9px] uppercase font-bold text-gray-500 tracking-wider">Email Address</span>
                    <span className="font-semibold text-gray-900">{previewLead.email}</span>
                  </div>
                )}
              </div>

              {/* Custom sheet variables */}
              {previewLead.channel_status?.custom_fields && Object.keys(previewLead.channel_status.custom_fields).length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-2.5">
                  <span className="block text-[9px] uppercase font-bold text-gray-500 tracking-widest mb-1.5">
                    Spreadsheet Variables (Parsed)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(previewLead.channel_status.custom_fields).map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 bg-white border border-border/60 rounded px-1.5 py-0.5 text-[9px] text-gray-900 font-mono shadow-2xs"
                      >
                        <span className="text-primary font-bold">{key}:</span>
                        <span className="font-semibold">{String(val)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Channel Tabs */}
            <div className="flex border-b text-xs bg-gray-100/10 shrink-0">
              {[
                { id: "whatsapp", label: "WhatsApp Message", icon: MessageSquare },
                { id: "email", label: "Email Template", icon: Mail },
                { id: "voice", label: "Voice Agent Prompt", icon: Mic },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setPreviewTab(t.id as any)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 font-bold transition-all border-b-2 outline-none",
                    previewTab === t.id
                      ? "border-primary text-primary bg-white shadow-2xs"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Preview Body */}
            <div className="p-5 overflow-y-auto flex-1 bg-gray-100/5 min-h-[220px]">
              {/* ── WhatsApp Bubble View ────────────────── */}
              {previewTab === "whatsapp" && (
                <div className="bg-[#e5ddd5] rounded-xl p-4 border relative min-h-[160px] flex flex-col justify-between shadow-inner">
                  <div className="space-y-2">
                    <div className="bg-white rounded-lg p-3 max-w-[85%] text-xs shadow-xs text-gray-900 leading-relaxed relative">
                      <div className="font-bold text-primary mb-1 flex items-center gap-1">
                        <span>📢 Meta WhatsApp Template</span>
                        <span className="px-1 py-0.5 rounded text-[8px] bg-primary/10 uppercase tracking-widest">
                          {watch("template_language") || "en"}
                        </span>
                      </div>
                      <p className="font-semibold mb-1 text-gray-500 text-[10px]">
                        Template Name: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{watch("template_name") || "hello_world"}</span>
                      </p>
                      <p className="text-gray-900 leading-relaxed mt-2 bg-gray-100/20 p-2 rounded-lg italic">
                        "Meta templates are rendered dynamically on the recipient's phone with variables mapping names and numbers."
                      </p>
                      <span className="block text-[8px] text-gray-500/60 text-right mt-1.5">
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500/60 text-center font-semibold mt-4">
                    Simulated WhatsApp Cloud API delivery block.
                  </div>
                </div>
              )}

              {/* ── Email Letterbox View ────────────────── */}
              {previewTab === "email" && (
                <div className="bg-white border rounded-xl shadow-md p-5 text-xs space-y-4">
                  <div className="space-y-1.5 pb-3 border-b border-border/60">
                    <p className="text-gray-500 font-semibold">
                      Subject: <span className="text-gray-900 font-bold">{clientInterpolate(watch("email_subject") || "Outreach Campaign", previewLead)}</span>
                    </p>
                    <p className="text-gray-500 font-semibold">
                      From: <span className="text-gray-900">{watch("email_from_name") || "Outreach"} &lt;{watch("email_from") || "noreply@company.com"}&gt;</span>
                    </p>
                  </div>

                  <div className="bg-gray-100/10 p-4 border border-border/40 rounded-lg space-y-3 font-sans max-w-full overflow-hidden leading-relaxed">
                    {watch("email_logo_url") && (
                      <div className="text-center">
                        <img src={watch("email_logo_url") || ""} alt="Logo" className="max-h-8 mx-auto" />
                      </div>
                    )}
                    <h4 className="text-center font-bold text-sm text-gray-900">
                      {clientInterpolate(watch("email_title") || "Welcome", previewLead)}
                    </h4>
                    <p className="whitespace-pre-line text-gray-500">
                      {clientInterpolate(watch("email_body") || "", previewLead)}
                    </p>
                    {watch("email_button_text") && (
                      <div className="text-center py-2">
                        <a
                          href={watch("email_button_url") || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block bg-primary text-primary-foreground font-bold px-4 py-2 rounded-lg shadow-sm text-[10px] uppercase tracking-wider"
                        >
                          {watch("email_button_text")}
                        </a>
                      </div>
                    )}
                    <p className="text-center text-[10px] text-gray-500/50 border-t pt-2 mt-3 leading-snug">
                      {clientInterpolate(watch("email_footer") || "", previewLead)}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Voice Waveform View ────────────────── */}
              {previewTab === "voice" && (
                <div className="bg-slate-950 text-slate-100 rounded-xl p-5 border relative min-h-[160px] flex flex-col justify-between shadow-lg">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <div className="flex items-center gap-1.5">
                        <Mic className="h-4 w-4 text-primary animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">LiveKit AI Voice Agent</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[8px] bg-primary/20 text-primary font-bold uppercase tracking-widest">
                        Voice ID: {watch("voice_id") || "anushka"} ({watch("voice_agent_type") || "livekit"})
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider">Synthesized Agent Prompt</span>
                      <p className="text-[11px] text-slate-200 bg-white/5 p-3 rounded-lg border border-white/5 whitespace-pre-line leading-relaxed italic">
                        "{clientInterpolate(watch("voice_prompt") || "", previewLead)}"
                      </p>
                    </div>
                  </div>

                  {/* Interactive waveform simulation */}
                  <div className="mt-4 flex items-center justify-between gap-4 pt-2 border-t border-white/10 shrink-0">
                    <div className="flex items-end gap-0.5 h-6">
                      {[4, 10, 16, 22, 14, 8, 16, 24, 20, 12, 18, 6].map((h, idx) => (
                        <div
                          key={idx}
                          className="w-1 bg-primary rounded-full transition-all duration-300 animate-pulse"
                          style={{
                            height: `${h}px`,
                            animationDelay: `${idx * 75}ms`,
                            animationDuration: '900ms'
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] text-slate-400 font-medium">Bouncing audio waveforms simulate voice dialog.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border shrink-0 flex justify-end bg-gray-100/10">
              <button
                type="button"
                onClick={() => setPreviewLead(null)}
                className="px-4 py-2 bg-foreground text-background font-bold text-xs rounded-xl shadow transition-all hover:bg-foreground/90"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
