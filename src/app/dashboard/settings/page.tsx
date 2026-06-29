"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, KeyRound, Save } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settings/keys")
      .then((res) => res.json())
      .then((data) => {
        if (data.keys) {
          setKeys(data.keys);
        }
      })
      .catch((err) => {
        toast.error("Failed to load API keys.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeys({ ...keys, [e.target.name]: e.target.value });
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
      toast.success("API Keys saved successfully! System is now using your keys.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">API Settings (BYOK)</h1>
        <p className="text-muted-foreground mt-2">
          Bring Your Own Key. Configure third-party services securely without relying on environment variables.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Meta / WhatsApp Settings */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <KeyRound className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Meta & WhatsApp API</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Meta Access Token</label>
              <input
                type="password"
                name="meta_access_token"
                value={keys.meta_access_token || ""}
                onChange={handleChange}
                placeholder="EAAO2iUY..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Phone Number ID</label>
              <input
                type="text"
                name="meta_phone_number_id"
                value={keys.meta_phone_number_id || ""}
                onChange={handleChange}
                placeholder="119022871..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">WABA ID</label>
              <input
                type="text"
                name="meta_waba_id"
                value={keys.meta_waba_id || ""}
                onChange={handleChange}
                placeholder="9976398..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* LiveKit Settings */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <KeyRound className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">LiveKit Cloud</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">WebSocket URL</label>
              <input
                type="text"
                name="livekit_url"
                value={keys.livekit_url || ""}
                onChange={handleChange}
                placeholder="wss://your-project.livekit.cloud"
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">API Key</label>
              <input
                type="password"
                name="livekit_api_key"
                value={keys.livekit_api_key || ""}
                onChange={handleChange}
                placeholder="API..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">API Secret</label>
              <input
                type="password"
                name="livekit_api_secret"
                value={keys.livekit_api_secret || ""}
                onChange={handleChange}
                placeholder="secret..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">SIP Trunk ID</label>
              <input
                type="text"
                name="livekit_sip_trunk_id"
                value={keys.livekit_sip_trunk_id || ""}
                onChange={handleChange}
                placeholder="ST_..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* AI Voice Engines */}
        <div className="bg-card border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b pb-4">
            <KeyRound className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">AI Voice Engines</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Gemini API Key</label>
              <input
                type="password"
                name="gemini_api_key"
                value={keys.gemini_api_key || ""}
                onChange={handleChange}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Sarvam API Key (Indic)</label>
              <input
                type="password"
                name="sarvam_api_key"
                value={keys.sarvam_api_key || ""}
                onChange={handleChange}
                placeholder="sk_..."
                className="w-full px-3 py-2 bg-background border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save API Keys
          </button>
        </div>
      </form>
    </div>
  );
}
