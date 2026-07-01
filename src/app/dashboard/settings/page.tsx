"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Save, MessageSquare, Phone, Mic, Brain,
  ShieldCheck, ExternalLink, Eye, EyeOff, CheckCircle2,
} from "lucide-react";
import { PageShell, PageHeader } from "@/components/ui";

interface FieldDef {
  name: string;
  label: string;
  placeholder: string;
  type?: "password" | "text";
  hint?: string;
}

interface SectionDef {
  id: string;
  title: string;
  description: string;
  icon: typeof MessageSquare;
  iconColor: string;
  badge?: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: "meta",
    title: "Meta & WhatsApp",
    description: "Connect your WhatsApp Business account via Meta's Cloud API.",
    icon: MessageSquare,
    iconColor: "text-primary bg-primary/10",
    badge: "Required",
    fields: [
      { name: "meta_access_token", label: "Access Token", placeholder: "EAAO2iUY...", type: "password", hint: "Permanent token from Meta Business Suite → System Users" },
      { name: "meta_phone_number_id", label: "Phone Number ID", placeholder: "119022871..." },
      { name: "meta_waba_id", label: "WhatsApp Business Account ID", placeholder: "9976398..." },
    ],
  },
  {
    id: "livekit",
    title: "LiveKit Cloud",
    description: "Powers real-time voice calls and SIP telephony for the Voice Agent.",
    icon: Phone,
    iconColor: "text-purple-500 bg-purple-500/10",
    fields: [
      { name: "livekit_url", label: "WebSocket URL", placeholder: "wss://your-project.livekit.cloud", type: "text" },
      { name: "livekit_api_key", label: "API Key", placeholder: "API...", type: "password" },
      { name: "livekit_api_secret", label: "API Secret", placeholder: "secret...", type: "password" },
      { name: "livekit_sip_trunk_id", label: "SIP Trunk ID", placeholder: "ST_...", type: "text" },
    ],
  },
  {
    id: "ai",
    title: "AI Voice Engines",
    description: "API keys for LLM and text-to-speech providers powering your voice agent.",
    icon: Mic,
    iconColor: "text-blue-500 bg-blue-500/10",
    fields: [
      { name: "gemini_api_key", label: "Gemini API Key", placeholder: "AIzaSy...", type: "password", hint: "Required for Gemini Live multimodal calls" },
      { name: "groq_api_key", label: "Groq API Key", placeholder: "gsk_...", type: "password", hint: "Used for LLM inference and chatbot fallback" },
      { name: "sarvam_api_key", label: "Sarvam API Key (Indic TTS)", placeholder: "sk_...", type: "password", hint: "Required for Hindi/English voice synthesis" },
    ],
  },
];

function KeyField({ field, value, onChange }: {
  field: FieldDef;
  value: string;
  onChange: (name: string, val: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const isPassword = field.type === "password";
  const hasValue = !!value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {field.label}
        </label>
        {hasValue && (
          <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
            <CheckCircle2 className="w-3 h-3" /> Configured
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={isPassword && !visible ? "password" : "text"}
          name={field.name}
          value={value}
          onChange={e => onChange(field.name, e.target.value)}
          placeholder={field.placeholder}
          className="w-full px-3 pr-10 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono transition-all"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {field.hint && (
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{field.hint}</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settings/keys")
      .then(r => r.json())
      .then(d => { if (d.keys) setKeys(d.keys); })
      .catch(() => toast.error("Failed to load API keys."))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (name: string, value: string) => {
    setKeys(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast.success("API keys saved — platform is now using your credentials.");
      setSaved(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }


  return (
    <PageShell size="narrow">
      <PageHeader
        icon={ShieldCheck}
        title="API Configuration"
        description="Bring Your Own Keys (BYOK) — credentials are encrypted and stored per account."
        action={
          <a
            href="https://docs.flowora.ai/settings"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Docs
          </a>
        }
      />

      <form onSubmit={handleSave} className="space-y-4">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <div key={section.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${section.iconColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                    {section.badge && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {section.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{section.description}</p>
                </div>
              </div>

              {/* Fields */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map(field => (
                  <div key={field.name} className={field.name.includes("token") || field.name.includes("url") ? "sm:col-span-2" : ""}>
                    <KeyField
                      field={field}
                      value={keys[field.name] || ""}
                      onChange={handleChange}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Save bar */}
        <div className="flex items-center justify-between py-4 px-5 bg-card border border-border rounded-2xl">
          <p className="text-xs text-muted-foreground">
            {saved ? "All changes saved." : "Unsaved changes will be lost."}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 shadow-sm shadow-primary/20"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : saved
              ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
              : <><Save className="w-4 h-4" /> Save Keys</>
            }
          </button>
        </div>
      </form>
    </PageShell>
  );
}
