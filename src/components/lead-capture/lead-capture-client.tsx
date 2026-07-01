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
  Activity
} from "lucide-react";
import { WhatsAppTemplate } from "@/types";
import { formatDate } from "@/lib/utils";

// Zod schema matching database migrations
const schema = z.object({
  name: z.string().optional().default("Untitled Workflow"),
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
  lead_capture_settings_id: string;
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
    voices: ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Puma"].map((id) => ({ id, name: id })),
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

export function LeadCaptureClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"sheet" | "whatsapp" | "smtp" | "email_template" | "voice">("sheet");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [capturedLeads, setCapturedLeads] = useState<Lead[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  // Multi-workflow state
  interface WorkflowSummary { id: string; name: string; is_active: boolean; }
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  // Live activity feed (derived from polling the leads queue)
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const prevLeadsRef = useRef<Map<string, Lead> | null>(null);

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

  // Fetch settings & lead history logs — now returns an array of workflows
  const fetchSettingsAndLeads = async (showToast = false) => {
    if (showToast) setRefreshing(true);
    try {
      const res = await fetch("/api/lead-capture");
      if (!res.ok) throw new Error("Failed to load settings");
      const { settings, leads } = await res.json();

      // Multi-workflow: settings is now an array
      const workflowsList: WorkflowSummary[] = (settings || []).map((s: any) => ({
        id: s.id,
        name: s.name || "Untitled Workflow",
        is_active: s.is_active,
      }));
      setWorkflows(workflowsList);

      // Auto-select the first workflow if none is selected
      const targetId = selectedWorkflowId || workflowsList[0]?.id;
      if (targetId && targetId !== selectedWorkflowId) {
        setSelectedWorkflowId(targetId);
      }

      // Find and populate the selected workflow's settings
      const selected = (settings || []).find((s: any) => s.id === (targetId || selectedWorkflowId));
      if (selected) {
        setSettingsId(selected.id);
        reset({
          sheet_url: selected.sheet_url,
          phone_column: selected.phone_column,
          name_column: selected.name_column,
          email_column: selected.email_column,
          template_name: selected.template_name,
          template_language: selected.template_language,
          delay_minutes: selected.delay_minutes,
          is_active: selected.is_active,
          whatsapp_enabled: selected.whatsapp_enabled !== false,
          email_enabled: !!selected.email_enabled,
          smtp_host: selected.smtp_host,
          smtp_port: selected.smtp_port || 587,
          smtp_user: selected.smtp_user,
          smtp_password: selected.smtp_password,
          email_from_name: selected.email_from_name,
          email_from: selected.email_from,
          email_subject: selected.email_subject,
          email_template_id: selected.email_template_id || "welcome",
          email_logo_url: selected.email_logo_url,
          email_brand_name: selected.email_brand_name || "My Agency",
          email_title: selected.email_title,
          email_body: selected.email_body,
          email_button_text: selected.email_button_text,
          email_button_url: selected.email_button_url,
          email_footer: selected.email_footer,
          voice_enabled: !!selected.voice_enabled,
          voice_agent_type: selected.voice_agent_type || "livekit",
          voice_id: selected.voice_id || "anushka",
          voice_prompt: selected.voice_prompt,
        });
      }

      const freshLeads: Lead[] = (leads || []).filter(
        (l: Lead) => !targetId || l.lead_capture_settings_id === targetId
      );

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

  // When user selects a different workflow, reload its settings
  useEffect(() => {
    if (selectedWorkflowId && workflows.length > 0) {
      fetchSettingsAndLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId]);

  // Create a new blank workflow
  const handleNewWorkflow = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/lead-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Workflow ${workflows.length + 1}`,
          sheet_url: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID",
          phone_column: "phone",
          is_active: false,
          whatsapp_enabled: true,
        }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = await res.json();
      setSelectedWorkflowId(data.settings.id);
      toast.success("New workflow created");
      fetchSettingsAndLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workflow");
    } finally {
      setSaving(false);
    }
  };

  // Delete a workflow
  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lead-capture?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete workflow");
      if (selectedWorkflowId === id) setSelectedWorkflowId(null);
      toast.success("Workflow deleted");
      fetchSettingsAndLeads();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  };

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
      fetchSettingsAndLeads();
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
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${styles[state] || "bg-muted text-muted-foreground border-border"}`}
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
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Dynamic Style Block for SVG Pulsing connection lines */}
      <style>{`
        @keyframes flowing-dash {
          to {
            stroke-dashoffset: -20;
          }
        }
        .flowing-wire {
          stroke-dasharray: 6, 4;
          animation: flowing-dash 0.8s linear infinite;
        }
        .pulsing-glow {
          box-shadow: 0 0 12px rgba(255, 226, 124, 0.4);
        }
      `}</style>

      {/* WORKFLOW SELECTOR */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Workflows</span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {workflows.length}
            </span>
          </div>
          <button
            type="button"
            onClick={handleNewWorkflow}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-primary-foreground" />
            New Workflow
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              onClick={() => setSelectedWorkflowId(wf.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all group ${
                selectedWorkflowId === wf.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${wf.is_active ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
              <span className="text-xs font-medium truncate max-w-[140px]">{wf.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(wf.id); }}
                disabled={deleting}
                className="opacity-0 group-hover:opacity-100 ml-1 text-muted-foreground hover:text-destructive transition-all"
                title="Delete workflow"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {workflows.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No workflows yet. Create one to get started.</p>
          )}
        </div>
      </div>

      {/* SECTION 1: INTERACTIVE WORKFLOW VISUALIZATION */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-6 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Layout className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm text-foreground">Interactive Workflow Pipeline</h3>
              <p className="text-[11px] text-muted-foreground">Visualise how leads travel from your Google Sheet to customer devices.</p>
            </div>
          </div>

          {/* Quick pause/resume — applies instantly without saving the whole form */}
          <button
            type="button"
            onClick={toggleAutomation}
            disabled={toggling || !settingsId}
            title={!settingsId ? "Save your configuration first" : isActive ? "Pause the workflow" : "Resume the workflow"}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15"
                : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
            }`}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isActive ? (
              <Pause className="w-3.5 h-3.5 fill-destructive" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-primary" />
            )}
            {toggling ? "Updating…" : isActive ? "Pause Workflow" : "Resume Workflow"}
          </button>
        </div>

        <div className="relative flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4 py-6 px-2 min-h-[160px]">
          
          {/* SVG Connection Lines overlay (Desktop only, rendered under elements) */}
          <div className="absolute inset-0 hidden md:block pointer-events-none z-0">
            <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
              {/* Line 1: Sheet -> Timer */}
              <path
                d="M 230,80 L 375,80"
                fill="none"
                stroke={isActive ? "#FFE27C" : "#cbd5e1"}
                strokeWidth={2}
                className={isActive ? "flowing-wire" : ""}
              />

              {/* Line 2: Timer -> WhatsApp (Branch Top) */}
              {whatsappEnabled !== false && (
                <path
                  d="M 495,80 Q 560,80 560,45 L 610,45"
                  fill="none"
                  stroke={isActive ? "#25D366" : "#cbd5e1"}
                  strokeWidth={2}
                  className={isActive ? "flowing-wire" : ""}
                />
              )}

              {/* Line 3: Timer -> Email (Branch Middle) */}
              {emailEnabled && (
                <path
                  d="M 495,80 Q 560,80 560,115 L 610,115"
                  fill="none"
                  stroke={isActive ? "#B1D8FC" : "#cbd5e1"}
                  strokeWidth={2}
                  className={isActive ? "flowing-wire" : ""}
                />
              )}

              {/* Line 4: Timer -> Voice (Branch Bottom) */}
              {voiceEnabled && (
                <path
                  d="M 495,80 Q 560,80 560,185 L 610,185"
                  fill="none"
                  stroke={isActive ? "#C4B1F9" : "#cbd5e1"}
                  strokeWidth={2}
                  className={isActive ? "flowing-wire" : ""}
                />
              )}
            </svg>
          </div>

          {/* Node 1: Google Sheet Source */}
          <div className={`w-full md:w-56 bg-background border rounded-xl p-3.5 z-10 flex items-start gap-3 transition-all ${
            isActive ? "border-primary/40 shadow-sm shadow-primary/5 ring-1 ring-primary/10" : "border-border"
          }`}>
            <div className={`p-2.5 rounded-lg shrink-0 ${isActive ? "bg-primary/10 text-primary animate-pulse" : "bg-muted text-muted-foreground"}`}>
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="overflow-hidden min-w-0">
              <h4 className="text-xs font-semibold text-foreground">1. Google Sheet Source</h4>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={sheetUrl || "Paste Sheet Link"}>
                {sheetUrl ? sheetUrl.replace(/https:\/\/(docs\.)?google\.com\/spreadsheets\/d\//, "").slice(0, 15) + "..." : "Setup Sheet Link"}
              </p>
              <span className={`inline-block mt-1 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {isActive ? "Active Listening" : "Paused"}
              </span>
            </div>
          </div>

          {/* Node 2: Delay Timer */}
          <div className={`w-full md:w-44 bg-background border rounded-xl p-3.5 z-10 flex items-start gap-3 transition-all ${
            isActive ? "border-amber-500/40 shadow-sm" : "border-border"
          }`}>
            <div className={`p-2.5 rounded-lg shrink-0 ${isActive ? "bg-amber-500/10 text-amber-500" : "bg-muted text-muted-foreground"}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground">2. Queue Delay</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                {Number(delayMinutes) > 0 ? `Wait ${delayMinutes} minutes` : "Trigger Instantly"}
              </p>
              <span className="text-[9px] text-muted-foreground/60 block mt-1">Deduplication active</span>
            </div>
          </div>

          {/* Channels block (Desktop splits, Mobile stack) */}
          <div className="flex flex-col gap-3 w-full md:w-60 z-10">
            {/* Node 3: WhatsApp */}
            <div className={`bg-background border rounded-xl p-3 flex items-start gap-3 transition-all ${
              whatsappEnabled !== false ? (isActive ? "border-emerald-500/40 shadow-sm text-foreground" : "border-border") : "opacity-40 border-dashed"
            }`}>
              <div className={`p-2 rounded-lg shrink-0 ${
                whatsappEnabled !== false ? (isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground"
              }`}>
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h4 className="text-xs font-semibold">WhatsApp channel</h4>
                <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                  {whatsappEnabled !== false ? (templateName ? `Template: ${templateName}` : "Setup Template") : "Disabled"}
                </p>
              </div>
            </div>

            {/* Node 4: SMTP Email */}
            <div className={`bg-background border rounded-xl p-3 flex items-start gap-3 transition-all ${
              emailEnabled ? (isActive ? "border-sky-400/40 shadow-sm text-foreground" : "border-border") : "opacity-40 border-dashed"
            }`}>
              <div className={`p-2 rounded-lg shrink-0 ${
                emailEnabled ? (isActive ? "bg-sky-400/10 text-sky-500 animate-pulse" : "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground"
              }`}>
                <Mail className="w-4 h-4" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h4 className="text-xs font-semibold">SMTP Email channel</h4>
                <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                  {emailEnabled ? `Preset: ${selectedEmailTemplateId}` : "Disabled"}
                </p>
              </div>
            </div>

            {/* Node 5: Voice Call */}
            <div className={`bg-background border rounded-xl p-3 flex items-start gap-3 transition-all ${
              voiceEnabled ? (isActive ? "border-purple-400/40 shadow-sm text-foreground" : "border-border") : "opacity-40 border-dashed"
            }`}>
              <div className={`p-2 rounded-lg shrink-0 ${
                voiceEnabled ? (isActive ? "bg-purple-400/10 text-purple-400 animate-pulse" : "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground"
              }`}>
                <Headphones className="w-4 h-4" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h4 className="text-xs font-semibold">Voice Agent channel</h4>
                <p className="text-[9px] text-muted-foreground truncate mt-0.5">
                  {voiceEnabled ? `Engine: ${voiceAgentType === "gemini" ? "Gemini" : "LiveKit"}` : "Disabled"}
                </p>
              </div>
            </div>
          </div>
          
        </div>
      </div>

      {/* SECTION 2: WORKFLOW CONFIGURATION & CAPTURED LEADS LIST */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Config Form (7 columns on desktop) */}
        <div className={`xl:col-span-7 space-y-6 ${activeTab === "email_template" && emailEnabled ? "xl:col-span-12" : ""}`}>
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-3">
              <Settings2 className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Configure Workflows</h3>
            </div>

            {/* Tab navigation buttons */}
            <div className="flex bg-muted/40 p-1 rounded-xl mb-4 border border-border/50 text-[11px] font-medium grid grid-cols-4">
              <button
                onClick={() => setActiveTab("sheet")}
                type="button"
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "sheet" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                Sheet Config
              </button>
              <button
                onClick={() => setActiveTab("whatsapp")}
                type="button"
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "whatsapp" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                WhatsApp
              </button>
              <button
                onClick={() => setActiveTab("smtp")}
                type="button"
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "smtp" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Server className="w-3.5 h-3.5 text-amber-500" />
                SMTP Setup
              </button>
              <button
                onClick={() => setActiveTab("email_template")}
                type="button"
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "email_template" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layout className="w-3.5 h-3.5 text-pink-500" />
                Email Builder
              </button>
              <button
                onClick={() => setActiveTab("voice")}
                type="button"
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "voice" ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Headphones className="w-3.5 h-3.5 text-purple-500" />
                Voice Agent
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              
              {/* TAB 1: Google Sheet configurations */}
              {activeTab === "sheet" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Workflow Name
                    </label>
                    <input
                      {...register("name")}
                      placeholder="e.g. Summer Campaign Leads"
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Google Sheet URL
                    </label>
                    <input
                      {...register("sheet_url")}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {errors.sheet_url && (
                      <p className="text-xs text-destructive">{errors.sheet_url.message}</p>
                    )}
                  </div>

                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50 space-y-3">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      Column Headers mapping
                    </span>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-foreground font-medium">Phone Header:</span>
                      <input
                        {...register("phone_column")}
                        placeholder="e.g. phone"
                        className="col-span-2 px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {errors.phone_column && (
                      <p className="text-xs text-destructive">{errors.phone_column.message}</p>
                    )}

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-muted-foreground">Name Header:</span>
                      <input
                        {...register("name_column")}
                        placeholder="e.g. name"
                        className="col-span-2 px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="grid grid-cols-3 items-center gap-2">
                      <span className="text-xs text-muted-foreground">Email Header:</span>
                      <input
                        {...register("email_column")}
                        placeholder="e.g. email"
                        className="col-span-2 px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Workflow Delay (Minutes)
                    </label>
                    <input
                      type="number"
                      {...register("delay_minutes")}
                      placeholder="0 (send immediately)"
                      className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                      <span className="text-xs font-semibold text-foreground">Send WhatsApp Message</span>
                      <span className="text-[10px] text-muted-foreground">Auto send templates on new lead</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("whatsapp_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {whatsappEnabled !== false && (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Select WhatsApp Template
                        </label>
                        {loadingTemplates ? (
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-input rounded-xl">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Loading templates...</span>
                          </div>
                        ) : (
                          <select
                            {...register("template_name")}
                            onChange={(e) => {
                              const t = templates.find((t) => t.name === e.target.value);
                              setValue("template_name", e.target.value);
                              if (t) setValue("template_language", t.language);
                            }}
                            className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Select a template</option>
                            {templates.map((t) => (
                              <option key={`${t.name}-${t.language}`} value={t.name}>
                                {t.display_name} ({t.language})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: SMTP Connection Server details */}
              {activeTab === "smtp" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-foreground">Send Branded SMTP Email</span>
                      <span className="text-[10px] text-muted-foreground">Auto send customized emails to leads</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("email_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>

                  {emailEnabled && (
                    <div className="space-y-4 pt-1">
                      <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex gap-2">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-amber-700 leading-normal">
                          <strong>Gmail Setup:</strong> Enter <strong>smtp.gmail.com</strong>, port <strong>587</strong>. 
                          You MUST use a Google <strong>App Password</strong> (not your normal Gmail password).
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">SMTP Host</label>
                          <input {...register("smtp_host")} placeholder="smtp.gmail.com" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">SMTP Port</label>
                          <input {...register("smtp_port")} type="number" placeholder="587" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">SMTP User (Username)</label>
                        <input {...register("smtp_user")} placeholder="your-agency@gmail.com" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">SMTP Password / App Password</label>
                        <input {...register("smtp_password")} type="password" placeholder="••••••••••••••••" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">From Name</label>
                          <input {...register("email_from_name")} placeholder="My Agency Team" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase">From Email</label>
                          <input {...register("email_from")} placeholder="team@agency.com" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: Email Builder with split-screen real-time preview */}
              {activeTab === "email_template" && (
                <div className="animate-fade-in space-y-4">
                  {!emailEnabled ? (
                    <div className="py-8 text-center bg-muted/40 rounded-2xl border border-border">
                      <Layout className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground font-medium">Please enable SMTP Email first</p>
                      <p className="text-[10px] text-muted-foreground/60 max-w-[200px] mx-auto mt-1">
                        Go to the SMTP Settings tab and toggle email dispatching to design templates.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                      
                      {/* Left Side: Form Controls */}
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                            Select Starter Template Preset
                          </label>
                          <select
                            value={selectedEmailTemplateId}
                            onChange={(e) => handleApplyPresetTemplate(e.target.value)}
                            className="w-full px-2.5 py-2 bg-background border border-input rounded-xl text-xs focus:outline-none"
                          >
                            {PREMADE_EMAIL_TEMPLATES.map((tmpl) => (
                              <option key={tmpl.id} value={tmpl.id}>
                                {tmpl.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Email Subject</label>
                          <input {...register("email_subject")} placeholder="Exclusive Offer: 20% OFF inside!" className="w-full px-3 py-2 bg-background border border-input rounded-xl text-xs focus:outline-none" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Logo Image URL</label>
                            <input {...register("email_logo_url")} placeholder="https://domain.com/logo.png" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Brand Name</label>
                            <input {...register("email_brand_name")} placeholder="My Agency Name" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Header Heading Title</label>
                          <input {...register("email_title")} placeholder="Your ebook is ready!" className="w-full px-3 py-2 bg-background border border-input rounded-xl text-xs focus:outline-none" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Email Body Message</label>
                            <div className="flex gap-1.5">
                              <span className="text-[8px] bg-muted px-1 py-0.5 rounded text-muted-foreground hover:bg-muted-foreground hover:text-white cursor-pointer" title="Inserts name dynamically" onClick={() => setValue("email_body", (previewBody || "") + " {{lead_name}}")}>{"{{lead_name}}"}</span>
                              <span className="text-[8px] bg-muted px-1 py-0.5 rounded text-muted-foreground hover:bg-muted-foreground hover:text-white cursor-pointer" title="Inserts email dynamically" onClick={() => setValue("email_body", (previewBody || "") + " {{lead_email}}")}>{"{{lead_email}}"}</span>
                            </div>
                          </div>
                          <textarea
                            {...register("email_body")}
                            rows={6}
                            placeholder="Hi {{lead_name}},\n\nThank you for choosing us..."
                            className="w-full px-3 py-2 bg-background border border-input rounded-xl text-xs focus:outline-none font-sans leading-relaxed"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">CTA Button Text</label>
                            <input {...register("email_button_text")} placeholder="Download Now" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">CTA Button URL</label>
                            <input {...register("email_button_url")} placeholder="https://link.com" className="w-full px-2.5 py-1.5 bg-background border border-input rounded-lg text-xs" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Footer Text</label>
                          <input {...register("email_footer")} placeholder="© 2026 My Brand. All rights reserved." className="w-full px-3 py-2 bg-background border border-input rounded-xl text-xs focus:outline-none" />
                        </div>
                      </div>

                      {/* Right Side: Real-time Device Preview Frame */}
                      <div className="space-y-3 bg-muted/20 border border-border/80 rounded-2xl p-4 flex flex-col h-full min-h-[500px]">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-destructive/60"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-primary/60"></span>
                            <span className="text-[10px] font-bold text-muted-foreground/80 font-mono ml-2">Live Preview (John Doe)</span>
                          </div>
                          
                          {/* Desktop / Mobile Switch toggle */}
                          <div className="flex bg-muted/60 p-0.5 rounded-lg border border-border">
                            <button
                              onClick={() => setPreviewDevice("desktop")}
                              type="button"
                              className={`p-1 rounded ${previewDevice === "desktop" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                              title="Desktop View"
                            >
                              <Monitor className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setPreviewDevice("mobile")}
                              type="button"
                              className={`p-1 rounded ${previewDevice === "mobile" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                              title="Mobile View"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Rendering preview in sandbox container */}
                        <div className="flex-1 flex justify-center items-center bg-muted/40 rounded-xl p-2 border border-border/40 overflow-hidden">
                          <div className={`transition-all duration-300 overflow-hidden ${
                            previewDevice === "mobile" 
                              ? "w-[320px] h-[450px] border-8 border-slate-800 rounded-3xl shadow-xl bg-white" 
                              : "w-full h-[450px] bg-white rounded-xl shadow-md border border-border/30"
                          }`}>
                            <iframe
                              title="Live Email Preview"
                              srcDoc={previewHtml}
                              className="w-full h-full border-0 select-none"
                            />
                          </div>
                        </div>
                      </div>
                      
                    </div>
                  )}
                </div>
              )}

              {/* Automation toggle footer */}
              <div className="flex items-center justify-between p-3 bg-muted/40 border border-border rounded-xl mt-4">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-foreground">Automation Status</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Toggle to start sync polling</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={saving}
                className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                  isActive 
                    ? "bg-primary hover:bg-primary/95 text-primary-foreground" 
                    : "bg-muted hover:bg-muted/80 text-foreground border border-border"
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
                    <Pause className="w-4 h-4 fill-foreground" />
                    Save Draft Settings
                  </>
                )}
              </button>
              {/* TAB 5: Voice Configurations */}
              {activeTab === "voice" && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-foreground">Trigger AI Voice Call</span>
                      <span className="text-[10px] text-muted-foreground">Automatically call the lead with AI</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        {...register("voice_enabled")}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                    </label>
                  </div>

                  {voiceEnabled && (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Agent Engine</label>
                        <select
                          {...register("voice_agent_type")}
                          className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm"
                        >
                          <option value="livekit">LiveKit + Sarvam TTS (Hindi/English)</option>
                          <option value="gemini">Gemini Live (Multilingual)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">Voice</label>
                        <select
                          {...register("voice_id")}
                          className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm"
                        >
                          {(voiceAgentType === "gemini" ? GEMINI_VOICES : SARVAM_VOICES).map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.voices.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground">
                          {voiceAgentType === "gemini"
                            ? "Gemini Live multilingual voices."
                            : "Sarvam TTS voices (Hindi + English). v3 voices are the newest & most natural."}
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                          System Prompt (Context for the Agent)
                        </label>
                        <textarea
                          {...register("voice_prompt")}
                          rows={6}
                          placeholder="You are an AI assistant calling {{lead_name}}. Remind them about..."
                          className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Available variables: <code className="bg-muted px-1 rounded">{"{{lead_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{brand_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{lead_phone}}"}</code>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Share Helper */}
          {activeTab !== "email_template" && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-semibold text-xs text-foreground uppercase tracking-wider">How to share Sheet</h4>
              </div>
              <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-2 leading-relaxed">
                <li>Open your Google Sheet.</li>
                <li>Click the **Share** button in the top-right corner.</li>
                <li>Under **General Access**, change Restricted to:
                   <span className="font-medium text-foreground block mt-0.5">"Anyone with the link can view"</span>
                </li>
                <li>Copy the full browser URL and paste it in the config form.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Right 5 cols: Live activity + Captured Leads log history */}
        {(activeTab !== "email_template" || !emailEnabled) && (
          <div className="xl:col-span-5 space-y-6">

            {/* Live workflow activity feed */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className={`w-4 h-4 ${autoRefresh ? "text-primary" : "text-muted-foreground"}`} />
                  <h3 className="font-semibold text-sm text-foreground">Live Activity</h3>
                  {autoRefresh && (
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {lastSynced ? `Synced ${lastSynced.toLocaleTimeString()}` : "Not synced"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoRefresh((v) => !v)}
                    className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                      autoRefresh
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                    title="Toggle 10s auto-refresh"
                  >
                    {autoRefresh ? "Auto" : "Paused"}
                  </button>
                </div>
              </div>
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin p-3 space-y-1.5 font-mono text-[10px] bg-muted/10">
                {activity.length === 0 ? (
                  <p className="text-muted-foreground/60 text-center py-6">
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
                        ? "text-muted-foreground"
                        : "text-blue-500";
                    return (
                      <div key={i} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-muted-foreground/50 shrink-0">{entry.ts}</span>
                        <span className={`${color} break-all`}>{entry.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col h-full shadow-sm min-h-[400px]">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm text-foreground">Captured Lead Logs</h3>
                </div>
                <button
                  onClick={() => fetchSettingsAndLeads(true)}
                  disabled={refreshing}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground transition-all"
                  title="Refresh logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="overflow-x-auto flex-1 max-h-[600px] scrollbar-thin">
                {capturedLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No leads captured yet</p>
                    <p className="text-xs text-muted-foreground/50 mt-1 max-w-sm">
                      Active automation will poll the Google Sheet every 30 seconds and list processed rows here.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wider">Lead</th>
                        <th className="px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wider">Status</th>
                        <th className="px-3 py-2.5 text-muted-foreground font-semibold uppercase tracking-wider">Outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {capturedLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-muted/15 transition-all">
                          <td className="px-3 py-2.5">
                            <div>
                              <p className="font-medium text-foreground">{lead.name ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{lead.phone}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">{getStatusBadge(lead.status)}</td>
                          <td className="px-3 py-2.5 font-mono text-[9px]">
                            {lead.status === "failed" ? (
                              <span className="text-destructive font-medium truncate max-w-[160px] block" title={lead.error_message || ""}>
                                {lead.error_message || "Delivery failed"}
                              </span>
                            ) : lead.status === "sent" ? (
                              <span className="text-primary font-medium">Successfully Sent</span>
                            ) : lead.status === "processing" ? (
                              <span className="text-blue-500 animate-pulse">Running...</span>
                            ) : (
                              <span className="text-muted-foreground">In Queue</span>
                            )}
                            {renderChannelBreakdown(lead)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
