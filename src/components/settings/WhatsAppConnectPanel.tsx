"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  Building2,
  ChevronDown,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";

const MASKED_TOKEN = "••••••••••••••••";

type ConnectionStatus = "connected" | "disconnected" | "unknown";
type ResetReason = "token_corrupted" | "meta_api_error" | null;

type RegistrationProbe = {
  live: boolean;
  checks: Record<string, boolean | null>;
  errors?: string[];
  last_registration_error?: string | null;
  registered_at?: string | null;
  subscribed_apps_at?: string | null;
};

export function WhatsAppConnectPanel() {
  const { workspace, member } = useWorkspace();
  const canEditSettings = member.role === "owner" || member.role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("unknown");
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const loadedWorkspaceIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [pin, setPin] = useState("");
  const [tokenEdited, setTokenEdited] = useState(false);

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  const [registrationProbe, setRegistrationProbe] = useState<RegistrationProbe | null>(null);

  // Setup instructions accordions state
  const [openAccordion, setOpenAccordion] = useState<number | null>(null);

  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/whatsapp/webhook`
      : "";

  const fetchConfig = useCallback(async (wsId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/config", { method: "GET" });
      const payload = await res.json();

      if (payload.reason === "no_config") {
        setConfig(null);
        setPhoneNumberId("");
        setWabaId("");
        setAccessToken("");
        setVerifyToken("");
        setPin("");
        setTokenEdited(false);
        setConnectionStatus("disconnected");
        setResetReason(null);
        setStatusMessage("");
      } else if (payload.connected) {
        setConfig(payload);
        setPhoneNumberId(payload.config?.phone_number_id || "");
        setWabaId(payload.config?.waba_id || "");
        setAccessToken(MASKED_TOKEN);
        setVerifyToken(payload.config?.verify_token || "");
        setPin("");
        setTokenEdited(false);
        setConnectionStatus("connected");
        setResetReason(null);
        setStatusMessage("");
      } else {
        setConfig(payload);
        setPhoneNumberId(payload.config?.phone_number_id || "");
        setWabaId(payload.config?.waba_id || "");
        setAccessToken(MASKED_TOKEN);
        setVerifyToken(payload.config?.verify_token || "");
        setPin("");
        setTokenEdited(false);
        setConnectionStatus("disconnected");
        setResetReason(payload.needs_reset ? "token_corrupted" : payload.reason === "meta_api_error" ? "meta_api_error" : null);
        setStatusMessage(payload.message || "");
      }
      setRegistrationProbe(null);
    } catch (err) {
      console.error("fetchConfig error:", err);
      toast.error("Failed to load WhatsApp configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!workspace?.id) return;
    if (loadedWorkspaceIdRef.current === workspace.id) return;
    loadedWorkspaceIdRef.current = workspace.id;
    fetchConfig(workspace.id);
  }, [workspace?.id, fetchConfig]);

  const handleSave = async () => {
    if (!phoneNumberId.trim()) {
      toast.error("Phone Number ID is required");
      return;
    }
    if (!config && (!accessToken.trim() || accessToken === MASKED_TOKEN)) {
      toast.error("Access Token is required for initial setup");
      return;
    }

    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        toast.error("Please re-enter or edit the Access Token to save changes");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save configuration");
        setSaving(false);
        return;
      }

      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 }
        );
      } else if (data.registration_skipped) {
        toast.success(
          "Credentials saved and verified. Inbound registration was skipped (no PIN) — see status below.",
          { duration: 10000 }
        );
        setPin("");
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live — ${data.phone_info.verified_name} can now receive events.`
            : "WhatsApp connected successfully."
        );
        setPin("");
      }

      if (workspace?.id) await fetchConfig(workspace.id);
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const res = await fetch("/api/whatsapp/config", { method: "GET" });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus("connected");
        setResetReason(null);
        setStatusMessage("");
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : "API connection successful"
        );
      } else {
        setConnectionStatus("disconnected");
        setResetReason(payload.needs_reset ? "token_corrupted" : payload.reason === "meta_api_error" ? "meta_api_error" : null);
        setStatusMessage(payload.message || "");
        toast.error(payload.message || "API connection failed");
      }
    } catch (err) {
      console.error("Test connection error:", err);
      setConnectionStatus("disconnected");
      toast.error("Connection test failed. Check network and try again.");
    } finally {
      setTesting(false);
    }
  };

  const handleVerifyRegistration = async () => {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch("/api/whatsapp/config/verify-registration", {
        method: "GET",
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success("Number is fully wired — Meta is delivering events.");
      } else {
        toast.error(
          "Number is not fully registered. See the checks below for which step failed.",
          { duration: 8000 }
        );
      }
      if (workspace?.id) await fetchConfig(workspace.id);
    } catch (err) {
      console.error("verify-registration failed:", err);
      toast.error("Could not reach the verification endpoint.");
    } finally {
      setVerifyingRegistration(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("This will delete the current WhatsApp config so you can re-enter it. Continue?")) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch("/api/whatsapp/config", { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to reset configuration");
        return;
      }

      toast.success("Configuration cleared.");
      setConfig(null);
      setPhoneNumberId("");
      setWabaId("");
      setAccessToken("");
      setVerifyToken("");
      setPin("");
      setTokenEdited(false);
      setConnectionStatus("disconnected");
      setResetReason(null);
      setStatusMessage("");
    } catch (err) {
      console.error("Reset error:", err);
      toast.error("Failed to reset configuration");
    } finally {
      setResetting(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied to clipboard");
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const showResetBanner = resetReason === "token_corrupted";

  return (
    <div className="max-w-[1200px] animate-in fade-in-50 duration-200">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-bold text-foreground mb-1">WhatsApp Business API</h1>
          <p className="text-[14px] text-muted-foreground">Connect your Meta developer account to send and receive WhatsApp messages.</p>
        </div>
        {connectionStatus === "connected" ? (
          <span className="bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-bold rounded-full border border-emerald-200">Connected</span>
        ) : (
          <span className="bg-amber-100 text-amber-700 px-3 py-1 text-xs font-bold rounded-full border border-amber-200">Not Connected</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {showResetBanner && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <h4 className="font-bold text-amber-800 text-[14px] mb-1">Stored token can&apos;t be decrypted</h4>
                <p className="text-[13px] text-amber-700 leading-relaxed">{statusMessage}</p>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-3" />
                      Reset Configuration
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {config && (
            <div className={`border rounded-xl p-5 ${isRegistered ? "bg-emerald-50/50 border-emerald-200" : "bg-amber-50/50 border-amber-200"}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="flex items-center gap-2">
                  {isRegistered ? (
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                  )}
                  <h4 className={`font-bold text-[14px] ${isRegistered ? "text-emerald-800" : "text-amber-800"}`}>
                    {isRegistered
                      ? "Registered — Meta will deliver events to Flowra"
                      : "Not registered — Meta will not deliver events"}
                  </h4>
                </div>
                <button
                  onClick={handleVerifyRegistration}
                  disabled={verifyingRegistration}
                  className="flex items-center gap-1 px-2.5 py-1 border border-border bg-white hover:bg-muted text-[12px] font-semibold text-foreground rounded-lg shadow-sm h-7"
                >
                  {verifyingRegistration ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Zap className="size-3 text-primary" />
                  )}
                  Verify with Meta
                </button>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {isRegistered ? (
                  <>
                    Subscribed since{" "}
                    {config.registered_at
                      ? new Date(config.registered_at).toLocaleString()
                      : "unknown"}
                    . Click <strong>Verify with Meta</strong> if messages stop arriving.
                  </>
                ) : lastRegistrationError ? (
                  <>
                    Last attempt failed with: <span className="text-red-600 font-semibold">&quot;{lastRegistrationError}&quot;</span>.
                    Enter the 6-digit PIN below and save to retry.
                  </>
                ) : (
                  <>
                    This connection was registered without tracking, or skipped. Provide a 6-digit verification PIN to complete routing configuration.
                  </>
                )}
              </p>

              {registrationProbe && (
                <div className="mt-3 rounded-lg border border-border bg-white p-3 space-y-2 text-[11px] shadow-sm">
                  <p className="font-semibold text-foreground">
                    Diagnostic check status:{" "}
                    <span className={registrationProbe.live ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                      {registrationProbe.live ? "LIVE" : "NOT LIVE"}
                    </span>
                  </p>
                  <ul className="grid grid-cols-2 gap-1.5 text-muted-foreground">
                    {Object.entries(registrationProbe.checks).map(([k, v]) => (
                      <li key={k} className="flex items-center gap-1.5">
                        {v === true ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                        ) : v === false ? (
                          <XCircle className="size-3.5 text-red-500 shrink-0" />
                        ) : (
                          <span className="size-3.5 rounded-full border border-border shrink-0" />
                        )}
                        <span className="font-mono">{k}</span>
                      </li>
                    ))}
                  </ul>
                  {(registrationProbe.errors ?? []).length > 0 && (
                    <ul className="pt-1.5 border-t border-border space-y-0.5 text-red-600 font-medium">
                      {registrationProbe.errors?.map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="text-[15px] font-semibold text-foreground border-b border-border pb-3">API Credentials</h3>
            
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Phone Number ID</label>
              <input
                type="text"
                placeholder="e.g. 100234567890123"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                disabled={!canEditSettings}
                className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">WhatsApp Business Account ID</label>
              <input
                type="text"
                placeholder="e.g. 100234567890456"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                disabled={!canEditSettings}
                className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Permanent Access Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  placeholder="E.g. EAAG..."
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value);
                    setTokenEdited(true);
                  }}
                  onFocus={() => {
                    if (accessToken === MASKED_TOKEN) {
                      setAccessToken("");
                      setTokenEdited(true);
                    }
                  }}
                  disabled={!canEditSettings}
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 pr-10 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {config && !tokenEdited && (
                <p className="text-[11px] text-muted-foreground">Token is masked for safety. Edit this field to supply a new one.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">Webhook Verify Token</label>
                <input
                  type="text"
                  placeholder="Create custom verify token"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  disabled={!canEditSettings}
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">6-Digit Registration PIN</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="PIN from Meta Manager"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={!canEditSettings}
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white tracking-widest"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              * The 6-digit verification PIN is configured in <strong>Meta Business Manager → WhatsApp Accounts → Phone Numbers</strong>. It is mandatory to receive inbound events on production numbers. Leave blank for test numbers.
            </p>
          </div>

          <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-3">
            <h3 className="text-[15px] font-semibold text-foreground">Webhook Configuration</h3>
            <p className="text-[13px] text-muted-foreground">Configure the callback URL in your Meta Developer Console under WhatsApp Webhooks.</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                className="w-full border border-border rounded-lg px-3.5 py-2 text-[13px] bg-muted text-muted-foreground font-mono"
              />
              <button
                onClick={handleCopyWebhookUrl}
                className="flex items-center justify-center p-2 border border-border rounded-lg bg-white hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 shadow-sm"
                title="Copy Webhook URL"
              >
                <Copy className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {canEditSettings && (
              <button
                onClick={handleSave}
                disabled={saving || !canEditSettings}
                className="px-6 py-2.5 bg-primary hover:bg-primary/95 text-foreground font-semibold text-[14px] rounded-lg shadow-sm shadow-primary/20 disabled:opacity-50 transition-all"
              >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            )}
            <button
              onClick={handleTestConnection}
              disabled={testing || !config}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-border bg-white hover:bg-muted text-[13px] font-semibold text-foreground rounded-lg shadow-sm disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin text-muted-foreground" /> Testing...
                </>
              ) : (
                <>
                  <Zap className="size-4 text-primary" /> Test API Connection
                </>
              )}
            </button>
            {config && canEditSettings && (
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-500 hover:text-red-700 bg-white hover:bg-red-50/50 rounded-lg text-[13px] font-semibold transition-colors"
              >
                {resetting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" /> Reset Config
                  </>
                )}
              </button>
            )}
          </div>


        </div>

        <div className="space-y-6">
          <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-foreground text-[15px] border-b border-border pb-3 mb-4">Setup Guide</h3>
            
            <div className="space-y-3">
              {[
                {
                  id: 1,
                  title: "Create a Meta App",
                  desc: "Go to developers.facebook.com. Create a new App of type Business. Connect it to your business portfolio."
                },
                {
                  id: 2,
                  title: "Add WhatsApp Product",
                  desc: "Inside your Meta App, add the 'WhatsApp' product. This creates a test sandbox number automatically."
                },
                {
                  id: 3,
                  title: "Collect Credentials",
                  desc: "From API Setup, copy the Phone Number ID and WABA ID. Generate a permanent System User Token under Business Settings."
                },
                {
                  id: 4,
                  title: "Configure Webhooks",
                  desc: "Set the Webhook callback to the URL shown on this page. Set your Verify Token and subscribe to the 'messages' field."
                }
              ].map((step) => {
                const isOpen = openAccordion === step.id;
                return (
                  <div key={step.id} className="border border-border rounded-lg overflow-hidden bg-muted/20">
                    <button
                      onClick={() => setOpenAccordion(isOpen ? null : step.id)}
                      className="w-full flex items-center justify-between p-3.5 text-left text-[13px] font-semibold text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                          {step.id}
                        </span>
                        {step.title}
                      </span>
                      <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="p-3.5 pt-0 text-[12px] text-muted-foreground leading-relaxed border-t border-border/40 bg-white">
                        {step.desc}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-border">
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
              >
                <ExternalLink className="size-3" />
                Meta API Documentation
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
