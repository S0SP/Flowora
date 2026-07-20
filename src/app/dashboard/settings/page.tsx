"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Building2, Shield, Bell, MessageCircle, Mail, Phone, CreditCard, Receipt, Key, Lock, FileText, Upload, Plus, MoreHorizontal, RefreshCw, Loader2, Users, Copy, Trash2, UserPlus, Check, X, ChevronDown, SlidersHorizontal, Coins } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useWorkspace } from "@/context/WorkspaceContext"
import { PresenceDot } from "@/components/presence/PresenceDot"
import { usePresence } from "@/hooks/use-presence"
import { WhatsAppConnectPanel } from "@/components/settings/WhatsAppConnectPanel"
import { TemplateManagerPanel } from "@/components/settings/TemplateManagerPanel"
import { TagsAndFieldsPanel } from "@/components/settings/TagsAndFieldsPanel"
import { DealsSettingsPanel } from "@/components/settings/DealsSettingsPanel"

const navGroups = [
  {
    group_label: "WORKSPACE",
    items: [
      { icon: Building2, label: "General" },
      { icon: SlidersHorizontal, label: "Fields & Tags" },
      { icon: Coins, label: "Deals & Currency" },
    ]
  },
  {
    group_label: "TEAM",
    items: [
      { icon: Users, label: "Members" },
    ]
  },
  {
    group_label: "CHANNELS",
    items: [
      { icon: MessageCircle, label: "WhatsApp Business" },
      { icon: FileText, label: "Message Templates" },
      { icon: Mail, label: "Email (SMTP)" },
      { icon: Phone, label: "Voice & Calling" },
    ]
  },
  {
    group_label: "DEVELOPER",
    items: [
      { icon: Key, label: "API Keys" },
    ]
  }
]

export default function SettingsPage() {
  const [activeItem, setActiveItem] = useState("General")
  const { workspace, member: myMember, profile } = useWorkspace()
  const { getPresence, getRow, now } = usePresence()

  const [wsId, setWsId] = useState("")
  const [workspaceName, setWorkspaceName] = useState("")
  const [industry, setIndustry] = useState("SaaS")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [language, setLanguage] = useState("en")

  const [businessDays, setBusinessDays] = useState([
    { day: "Monday", enabled: true, open: "09:00", close: "18:00" },
    { day: "Tuesday", enabled: true, open: "09:00", close: "18:00" },
    { day: "Wednesday", enabled: true, open: "09:00", close: "18:00" },
    { day: "Thursday", enabled: true, open: "09:00", close: "18:00" },
    { day: "Friday", enabled: true, open: "09:00", close: "18:00" },
    { day: "Saturday", enabled: false, open: "09:00", close: "18:00" },
    { day: "Sunday", enabled: false, open: "09:00", close: "18:00" },
  ])

  const [waPhoneId, setWaPhoneId] = useState("")
  const [waAccountId, setWaAccountId] = useState("")
  const [waToken, setWaToken] = useState("")

  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("")
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")

  const [livekitUrl, setLivekitUrl] = useState("")
  const [livekitApiKey, setLivekitApiKey] = useState("")
  const [livekitApiSecret, setLivekitApiSecret] = useState("")
  const [deepgramApiKey, setDeepgramApiKey] = useState("")
  const [sarvamApiKey, setSarvamApiKey] = useState("")

  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // ── Members state ─────────────────────────────────────────
  type Member = {
    id: string; user_id: string; role: string; status: string
    full_name: string | null; email: string; avatar_url: string | null
    presence_status: string; last_seen_at: string | null
  }
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteRole, setInviteRole] = useState("agent")
  const [inviteLabel, setInviteLabel] = useState("")
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7)
  const [creatingInvite, setCreatingInvite] = useState(false)
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null)
  const [generatedInviteExpiry, setGeneratedInviteExpiry] = useState<Date | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true)
    try {
      const res = await fetch("/api/workspace/members")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMembers(data.members ?? [])
    } catch {
      toast.error("Failed to load members")
    } finally {
      setLoadingMembers(false)
    }
  }, [])

  const [activeInvites, setActiveInvites] = useState<any[]>([])
  const [loadingInvites, setLoadingInvites] = useState(false)

  const fetchInvites = useCallback(async () => {
    setLoadingInvites(true)
    try {
      const res = await fetch("/api/workspace/invitations")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setActiveInvites(data.invitations ?? [])
    } catch {
      console.error("Failed to load invitations")
    } finally {
      setLoadingInvites(false)
    }
  }, [])

  useEffect(() => {
    if (activeItem === "Members") {
      fetchMembers()
      fetchInvites()
    }
  }, [activeItem, fetchMembers, fetchInvites])

  const handleCreateInvite = async () => {
    setCreatingInvite(true)
    try {
      const res = await fetch("/api/workspace/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole, label: inviteLabel, expiresInDays: inviteExpiryDays }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "Failed to create invitation")
      }
      const data = await res.json()
      const url = `${window.location.origin}/invite/${data.token}`
      setGeneratedInviteUrl(url)
      // Calculate expiry from the invitation object
      if (data.invitation?.expires_at) {
        setGeneratedInviteExpiry(new Date(data.invitation.expires_at))
      } else {
        const exp = new Date()
        exp.setDate(exp.getDate() + inviteExpiryDays)
        setGeneratedInviteExpiry(exp)
      }
      toast.success("Invite link generated!")
      fetchInvites() // Refresh the active list
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Revoke this pending invitation link?")) return
    try {
      const res = await fetch(`/api/workspace/invitations/${inviteId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to revoke invitation")
      }
      toast.success("Invitation link revoked")
      fetchInvites()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const copyInviteUrl = async () => {
    if (!generatedInviteUrl) return
    await navigator.clipboard.writeText(generatedInviteUrl)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
    toast.success("Invite link copied!")
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Remove this member from the workspace?")) return
    try {
      const res = await fetch(`/api/workspace/members/${memberId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast.success("Member removed")
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleChangeRole = async (memberId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/workspace/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast.success("Role updated")
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // ── API Keys state ─────────────────────────────────────────
  type ApiKey = {
    id: string; name: string; key_prefix: string
    scopes: string[]; last_used_at: string | null
    expires_at: string | null; created_at: string
  }
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loadingApiKeys, setLoadingApiKeys] = useState(false)
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [creatingKey, setCreatingKey] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const fetchApiKeys = useCallback(async () => {
    setLoadingApiKeys(true)
    try {
      const res = await fetch("/api/workspace/api-keys")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setApiKeys(data.keys ?? [])
    } catch {
      toast.error("Failed to load API keys")
    } finally {
      setLoadingApiKeys(false)
    }
  }, [])

  useEffect(() => {
    if (activeItem === "API Keys") fetchApiKeys()
  }, [activeItem, fetchApiKeys])

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return
    setCreatingKey(true)
    try {
      const res = await fetch("/api/workspace/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (!res.ok) throw new Error("Failed to create key")
      const data = await res.json()
      setGeneratedKey(data.plaintext)
      setNewKeyName("")
      fetchApiKeys()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingKey(false)
    }
  }

  const copyKey = async () => {
    if (!generatedKey) return
    await navigator.clipboard.writeText(generatedKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
    toast.success("API key copied!")
  }

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Revoke this API key? It cannot be undone.")) return
    try {
      const res = await fetch(`/api/workspace/api-keys/${keyId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("API key revoked")
      fetchApiKeys()
    } catch {
      toast.error("Failed to revoke key")
    }
  }


  // 1. Fetch settings from DB on mount
  useEffect(() => {
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        setWsId(data.workspaceId || "")
        setWorkspaceName(data.name || "")
        setIndustry(data.industry || "SaaS")
        setTimezone(data.timezone || "Asia/Kolkata")
        setLanguage(data.language || "en")
        if (data.businessHours && Array.isArray(data.businessHours) && data.businessHours.length > 0) {
          setBusinessDays(data.businessHours)
        }
      })
      .catch(console.error)

    fetch("/api/settings/keys")
      .then(res => res.json())
      .then(data => {
        const connections = data.connections ?? []
        const wa = connections.find((c: any) => c.type === "whatsapp")
        if (wa) {
          setWaPhoneId(wa.config?.phoneNumberId || "")
          setWaAccountId(wa.config?.wabaId || "")
          setWaToken("••••••••••••••••")
        }
        const smtp = connections.find((c: any) => c.type === "email")
        if (smtp) {
          setSmtpHost(smtp.config?.host || "")
          setSmtpPort(smtp.config?.port || "")
          setSmtpUser(smtp.config?.user || "")
          setSmtpPass("••••••••••••••••")
        }
        const voice = connections.find((c: any) => c.type === "voice")
        if (voice) {
          setLivekitUrl(voice.config?.livekitUrl || "")
          setDeepgramApiKey(voice.config?.deepgramApiKey || "")
          setSarvamApiKey(voice.config?.sarvamApiKey || "")
          setLivekitApiKey("••••••••••••••••")
          setLivekitApiSecret("••••••••••••••••")
        }
      })
      .catch(console.error)
  }, [])

  const [testingSmtp, setTestingSmtp] = useState(false)
  const handleTestSmtp = async () => {
    try {
      setTestingSmtp(true)
      const res = await fetch("/api/settings/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpHost,
          port: parseInt(smtpPort),
          user: smtpUser,
          password: smtpPass
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to connect to SMTP server")
      toast.success("SMTP connection successful!")
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setTestingSmtp(false)
    }
  }

  // 2. Save settings to DB
  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (activeItem === "General") {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: workspaceName,
            industry,
            timezone,
            language,
            businessHours: businessDays,
          }),
        })
        if (!res.ok) throw new Error("Failed to save general settings")
        toast.success("General settings saved successfully!")
      } else if (activeItem === "WhatsApp Business") {
        const body: any = {
          workspaceId: wsId,
          type: "whatsapp",
          config: {
            phoneNumberId: waPhoneId,
            wabaId: waAccountId,
          },
          secrets: {},
        }
        if (waToken && waToken !== "••••••••••••••••") {
          body.secrets.accessToken = waToken
        }
        const res = await fetch("/api/settings/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("Failed to save WhatsApp keys")
        toast.success("WhatsApp Business settings saved successfully!")
      } else if (activeItem === "Email (SMTP)") {
        const body: any = {
          workspaceId: wsId,
          type: "email",
          config: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
          },
          secrets: {},
        }
        if (smtpPass && smtpPass !== "••••••••••••••••") {
          body.secrets.password = smtpPass
        }
        const res = await fetch("/api/settings/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("Failed to save SMTP settings")
        toast.success("SMTP Email configuration saved successfully!")
      } else if (activeItem === "Voice & Calling") {
        const body: any = {
          workspaceId: wsId,
          type: "voice",
          config: {
            livekitUrl,
            deepgramApiKey,
            sarvamApiKey,
          },
          secrets: {},
        }
        if (livekitApiKey && livekitApiKey !== "••••••••••••••••") {
          body.secrets.apiKey = livekitApiKey
        }
        if (livekitApiSecret && livekitApiSecret !== "••••••••••••••••") {
          body.secrets.apiSecret = livekitApiSecret
        }
        const res = await fetch("/api/settings/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error("Failed to save Voice settings")
        toast.success("Voice & Calling configuration saved successfully!")
      } else {
        toast.info("Save logic for this section is under development")
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred while saving")
    } finally {
      setIsSaving(false)
    }
  }

  const renderContent = () => {
    switch (activeItem) {
      case "General":
        return (
          <div className="max-w-[800px]">
            <h1 className="text-[22px] font-bold text-gray-900 mb-1">General Settings</h1>
            <p className="text-[14px] text-gray-500 mb-7">Configure your workspace name, timezone, and preferences</p>
            
            <div className="space-y-6">
              
              {/* Workspace Identity */}
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 mb-3">Workspace Identity</h3>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
                  
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Workspace Name</label>
                    <input 
                      type="text" 
                      value={workspaceName}
                      onChange={e => setWorkspaceName(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Workspace Logo</label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 bg-gray-100/30 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#FFE27C] transition-colors">
                      <Upload className="h-6 w-6 text-gray-500 mb-2" />
                      <p className="text-[13px] text-gray-500 mb-1">Drop logo here or click to upload</p>
                      <p className="text-[11px] text-gray-500">PNG, JPG up to 2MB. Recommended 200x200px</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Website URL</label>
                    <input 
                      type="url" 
                      value={websiteUrl}
                      onChange={e => setWebsiteUrl(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Industry</label>
                    <select 
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white"
                    >
                      <option>SaaS</option>
                      <option>E-commerce</option>
                      <option>Real Estate</option>
                      <option>Healthcare</option>
                      <option>Education</option>
                      <option>Fintech</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Localization */}
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 mb-3">Localization</h3>
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Timezone</label>
                    <select 
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (UTC +5:30)</option>
                      <option value="America/New_York">America/New_York (UTC -5:00)</option>
                      <option value="Europe/London">Europe/London (UTC +0:00)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Date Format</label>
                    <select className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white">
                      <option>DD/MM/YYYY</option>
                      <option>MM/DD/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[13px] font-semibold text-gray-900">Language</label>
                    <select 
                      value={language}
                      onChange={e => setLanguage(e.target.value)}
                      className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white"
                    >
                      <option value="en">English (US)</option>
                      <option value="hi">Hindi</option>
                      <option value="ar">Arabic</option>
                      <option value="es">Spanish</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Business Hours */}
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 mb-1">Business Hours</h3>
                <p className="text-[13px] text-gray-500 mb-3">Set your business hours so the AI chatbot knows when to route to a human agent</p>
                
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                  {businessDays.map((d, i) => (
                    <div key={d.day} className="flex items-center gap-4 py-3 border-b border-border last:border-0">
                      <div className="w-[100px] flex items-center gap-3">
                        <button
                          onClick={() => {
                            const nd = [...businessDays]
                            nd[i].enabled = !nd[i].enabled
                            setBusinessDays(nd)
                          }}
                          className={cn(
                            "w-9 h-5 rounded-full relative transition-colors shrink-0",
                            d.enabled ? "bg-primary" : "bg-border"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                            d.enabled ? "left-[18px]" : "left-0.5"
                          )} />
                        </button>
                        <span className="text-[13px] font-medium text-gray-900">{d.day}</span>
                      </div>

                      {d.enabled ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={d.open}
                            onChange={(e) => {
                              const nd = [...businessDays]
                              nd[i].open = e.target.value
                              setBusinessDays(nd)
                            }}
                            className="border border-border rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none"
                          />
                          <span className="text-gray-500 text-[13px]">-</span>
                          <input
                            type="time"
                            value={d.close}
                            onChange={(e) => {
                              const nd = [...businessDays]
                              nd[i].close = e.target.value
                              setBusinessDays(nd)
                            }}
                            className="border border-border rounded-md px-2.5 py-1.5 text-[13px] focus:outline-none"
                          />
                        </div>
                      ) : (
                        <span className="text-[13px] text-gray-500">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 text-gray-900 font-semibold text-[14px] rounded-lg shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving ? "Saving..." : "Save General Settings"}
                </button>
              </div>

            </div>
          </div>
        )

      case "WhatsApp Business":
        return <WhatsAppConnectPanel />
      case "Message Templates":
        return <TemplateManagerPanel />
      case "Fields & Tags":
        return <TagsAndFieldsPanel />
      case "Deals & Currency":
        return <DealsSettingsPanel />
      case "Email (SMTP)":
        return (
          <div className="max-w-[800px]">
            <h1 className="text-[22px] font-bold text-gray-900 mb-1">Email Integration</h1>
            <p className="text-[14px] text-gray-500 mb-7">Configure SMTP to send emails directly from workflows.</p>
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-900 mb-1.5">SMTP Host</label>
                  <input 
                    type="text" 
                    value={smtpHost}
                    onChange={e => setSmtpHost(e.target.value)}
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px]" 
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-900 mb-1.5">Port</label>
                  <input 
                    type="text" 
                    value={smtpPort}
                    onChange={e => setSmtpPort(e.target.value)}
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px]" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-900 mb-1.5">Username</label>
                  <input 
                    type="text" 
                    value={smtpUser}
                    onChange={e => setSmtpUser(e.target.value)}
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px]" 
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-900 mb-1.5">Password</label>
                  <input 
                    type="password" 
                    value={smtpPass}
                    onChange={e => setSmtpPass(e.target.value)}
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px]" 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={handleTestSmtp}
                  disabled={testingSmtp}
                  className="px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingSmtp && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Test Connection
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 text-gray-900 font-semibold text-[14px] rounded-lg shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving ? "Saving..." : "Save Email Settings"}
                </button>
              </div>
            </div>
          </div>
        )
      case "Voice & Calling":
        return (
          <div className="max-w-[800px]">
            <h1 className="text-[22px] font-bold text-gray-900 mb-1">Voice & Calling Configuration</h1>
            <p className="text-[14px] text-gray-500 mb-7">Configure Sarvam AI (TTS), Deepgram (STT), and Gemini Live for the Dograh voice worker.</p>
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-900">Deepgram API Key (STT)</label>
                  <input 
                    type="password" 
                    value={deepgramApiKey}
                    onChange={e => setDeepgramApiKey(e.target.value)}
                    placeholder="Deepgram API key" 
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-900">Sarvam API Key (TTS)</label>
                  <input 
                    type="password" 
                    value={sarvamApiKey}
                    onChange={e => setSarvamApiKey(e.target.value)}
                    placeholder="Sarvam API key" 
                    className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-primary" 
                  />
                </div>
              </div>

              <div className="bg-primary/8 border border-primary/20 rounded-lg p-4">
                <p className="text-[12px] font-semibold text-gray-900 mb-1">Dograh Integration Note</p>
                <p className="text-[12px] text-gray-500">
                  Dograh API keys and phone number assignments are managed by your admin on the private Dograh panel. 
                  Voice call presets (system prompt, intent, TTS voice) are configured in Voice Agent settings.
                </p>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 text-gray-900 font-semibold text-[14px] rounded-lg shadow-sm disabled:opacity-50 transition-all"
                >
                  {isSaving ? "Saving..." : "Save Voice Settings"}
                </button>
              </div>
            </div>
          </div>
        )

      case "API Keys":
        return (
          <div className="max-w-[800px]">
            <div className="flex items-center justify-between mb-7">
              <div>
                <h1 className="text-[22px] font-bold text-gray-900 mb-1">API Keys</h1>
                <p className="text-[14px] text-gray-500">Manage developer keys for programmatic access.</p>
              </div>
              <button
                onClick={() => { setGeneratedKey(null); setShowCreateKeyModal(true) }}
                className="flex items-center gap-2 bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-900 dark:text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <Plus className="h-4 w-4" /> Generate Key
              </button>
            </div>

            {/* Generated key reveal banner */}
            {generatedKey && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-amber-700 mb-1">Copy your key now — it won&apos;t be shown again</p>
                  <code className="text-[13px] text-amber-900 break-all">{generatedKey}</code>
                </div>
                <button onClick={copyKey} className="shrink-0 flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[13px] font-medium hover:bg-amber-700">
                  {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedKey ? "Copied!" : "Copy"}
                </button>
              </div>
            )}

            {loadingApiKeys ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
            ) : apiKeys.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-10 text-center text-gray-500 text-[14px]">
                No API keys yet. Generate one above.
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                {apiKeys.map((k, i) => (
                  <div key={k.id} className={cn("p-5 flex items-center justify-between", i < apiKeys.length - 1 && "border-b border-border")}>
                    <div>
                      <h4 className="font-bold text-[14px] text-gray-900">{k.name}</h4>
                      <p className="text-[12px] text-gray-500">
                        {k.key_prefix}••••••• · Created {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      className="text-red-500 hover:text-red-700 text-[13px] font-medium transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Create key modal */}
            {showCreateKeyModal && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateKeyModal(false)}>
                <div className="bg-card dark:bg-[#18181B] border border-transparent dark:border-[#27272A] rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">Generate API Key</h3>
                    <button onClick={() => setShowCreateKeyModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><X className="h-5 w-5 text-gray-500 dark:text-gray-400" /></button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[13px] font-semibold text-gray-900 dark:text-gray-200 mb-1.5 block">Key Name</label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder="e.g. Production Server"
                        className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
                        onKeyDown={e => e.key === "Enter" && handleCreateKey()}
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button onClick={() => setShowCreateKeyModal(false)} className="flex-1 py-2 border border-border dark:border-[#27272A] rounded-lg text-[14px] font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">Cancel</button>
                    <button
                      onClick={handleCreateKey}
                      disabled={creatingKey || !newKeyName.trim()}
                      className="flex-1 py-2 bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-900 dark:text-white rounded-lg text-[14px] font-semibold hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50 transition-all"
                    >
                      {creatingKey ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Generate"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      case "Members":
        return (
          <div className="max-w-[860px]">
            <div className="flex items-center justify-between mb-7">
              <div>
                <h1 className="text-[22px] font-bold text-gray-900 mb-1">Team Members</h1>
                <p className="text-[14px] text-gray-500">Manage who has access to your workspace.</p>
              </div>
              <button
                onClick={() => { setGeneratedInviteUrl(null); setShowInviteModal(true) }}
                className="flex items-center gap-2 bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-900 dark:text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                <UserPlus className="h-4 w-4" /> Invite Member
              </button>
            </div>

            {loadingMembers ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="divide-y divide-border">
                  {members.map((m) => {
                    const presenceRow = getRow(m.user_id)
                    const status = presenceRow
                      ? (() => {
                          const diff = now - new Date(presenceRow.last_seen_at).getTime()
                          if (diff < 90_000) return "online" as const
                          if (diff < 300_000) return "away" as const
                          return "offline" as const
                        })()
                      : (m.presence_status as "online" | "away" | "offline" || "offline")

                    return (
                      <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt={m.full_name || m.email} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-[14px] font-bold text-primary">
                              {(m.full_name || m.email).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <PresenceDot status={status} className="absolute -bottom-0.5 -right-0.5" />
                        </div>

                        {/* Name + email */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-gray-900 truncate">{m.full_name || m.email}</span>
                            {m.user_id === profile.id && (
                              <span className="text-[10px] font-bold text-gray-500 bg-border px-1.5 py-0.5 rounded">YOU</span>
                            )}
                          </div>
                          <span className="text-[12px] text-gray-500 truncate block">{m.email}</span>
                        </div>

                        {/* Role selector */}
                        {myMember.role === "owner" && m.user_id !== profile.id ? (
                          <div className="relative">
                            <select
                              value={m.role}
                              onChange={e => handleChangeRole(m.id, e.target.value)}
                              className="appearance-none bg-gray-50 border border-border rounded-lg px-3 py-1.5 text-[13px] font-medium text-gray-900 pr-7 focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="agent">Agent</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
                          </div>
                        ) : (
                          <span className="text-[13px] font-medium text-gray-500 capitalize">{m.role}</span>
                        )}

                        {/* Status badge */}
                        <span className={cn(
                          "text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0",
                          m.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {m.status === "active" ? "Active" : "Invited"}
                        </span>

                        {/* Remove */}
                        {myMember.role === "owner" && m.user_id !== profile.id && (
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pending Invitations Section */}
            <div className="mt-10">
              <h2 className="text-[16px] font-bold text-gray-900 mb-3">Pending Invitations</h2>
              {loadingInvites ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div>
              ) : activeInvites.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-6 text-center text-gray-500 text-[13px]">
                  No pending invitation links. Create one above.
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm divide-y divide-border">
                  {activeInvites.map((inv) => {
                    const expiry = new Date(inv.expires_at)
                    const totalMs = 30 * 24 * 60 * 60 * 1000 // estimate max 30 days
                    const remaining = expiry.getTime() - Date.now()
                    const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100))
                    const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))

                    return (
                      <div key={inv.id} className="p-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-semibold text-gray-900 truncate">
                              {inv.label || "Unnamed Invite"}
                            </span>
                            <span className="text-[10px] font-bold bg-primary/10 text-primary-foreground px-2 py-0.5 rounded capitalize">
                              {inv.role}
                            </span>
                          </div>
                          
                          {/* Expiry display & progress bar */}
                          <div className="flex items-center gap-4 max-w-sm">
                            <div className="flex-1">
                              <div className="h-1 bg-border rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    daysLeft <= 1 ? "bg-red-500" : daysLeft <= 3 ? "bg-amber-500" : "bg-green-500"
                                  )} 
                                  style={{ width: `${pct}%` }} 
                                />
                              </div>
                            </div>
                            <span className="text-[11px] text-gray-500 shrink-0 font-medium">
                              Expires in {daysLeft} {daysLeft === 1 ? "day" : "days"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="text-red-500 hover:text-red-700 text-[13px] font-semibold flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Revoke
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
              <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
                <div className="bg-card dark:bg-[#18181B] border border-transparent dark:border-[#27272A] rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[16px] font-bold text-gray-900 dark:text-white">Invite Team Member</h3>
                    <button onClick={() => setShowInviteModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><X className="h-5 w-5 text-gray-500 dark:text-gray-400" /></button>
                  </div>

                  {generatedInviteUrl ? (
                    <div className="space-y-4">
                      {/* Invite URL display */}
                      <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[12px] font-bold text-green-700 dark:text-green-400">✓ Invite link generated</p>
                          {generatedInviteExpiry && (
                            <span className="text-[11px] font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-500/20 px-2 py-0.5 rounded-full">
                              Expires {generatedInviteExpiry.toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <code className="block text-[11px] text-green-900 dark:text-green-300 break-all bg-green-100/60 dark:bg-green-500/20 rounded-lg p-2 font-mono">
                          {generatedInviteUrl}
                        </code>
                        {/* Expiry progress bar */}
                        {generatedInviteExpiry && (() => {
                          const now = Date.now()
                          const totalMs = inviteExpiryDays * 24 * 60 * 60 * 1000
                          const remaining = generatedInviteExpiry.getTime() - now
                          const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100))
                          const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
                          return (
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-green-700 dark:text-green-400 font-medium">
                                <span>Validity progress</span>
                                <span>{daysLeft}d remaining</span>
                              </div>
                              <div className="h-1.5 bg-green-200 dark:bg-green-500/20 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-2">
                        <button onClick={copyInviteUrl} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-900 dark:text-white rounded-lg text-[13px] font-semibold hover:bg-gray-100 dark:hover:bg-white/10">
                          {copiedInvite ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedInvite ? "Copied!" : "Copy Link"}
                        </button>
                        <button 
                          onClick={() => { setGeneratedInviteUrl(null); setGeneratedInviteExpiry(null); setInviteLabel(""); }} 
                          className="flex-1 py-2.5 border border-border dark:border-[#27272A] rounded-lg text-[13px] font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          New Link
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
                        Share this link with your team member. It can only be used once.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="text-[13px] font-semibold text-gray-900 dark:text-gray-200 mb-1.5 block">Role</label>
                        <select
                          value={inviteRole}
                          onChange={e => setInviteRole(e.target.value)}
                          className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="agent">Agent</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[13px] font-semibold text-gray-900 dark:text-gray-200 mb-1.5 block">Label (optional)</label>
                        <input
                          type="text"
                          value={inviteLabel}
                          onChange={e => setInviteLabel(e.target.value)}
                          placeholder="e.g. John from Sales"
                          className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] font-semibold text-gray-900 dark:text-gray-200 mb-1.5 block">Expires in</label>
                        <select
                          value={inviteExpiryDays}
                          onChange={e => setInviteExpiryDays(Number(e.target.value))}
                          className="w-full border border-border dark:border-[#27272A] bg-white dark:bg-[#111114] text-gray-900 dark:text-white rounded-lg px-3.5 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary appearance-none"
                        >
                          <option value={1}>1 day</option>
                          <option value={7}>7 days</option>
                          <option value={30}>30 days</option>
                        </select>
                      </div>
                      <div className="flex gap-3 mt-2">
                        <button onClick={() => setShowInviteModal(false)} className="flex-1 py-2 border border-border dark:border-[#27272A] rounded-lg text-[14px] font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10">Cancel</button>
                        <button
                          onClick={handleCreateInvite}
                          disabled={creatingInvite}
                          className="flex-1 py-2 bg-white dark:bg-[#111114] border border-border dark:border-[#27272A] text-gray-900 dark:text-white rounded-lg text-[14px] font-semibold hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50"
                        >
                          {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Generate Link"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className="max-w-[800px] h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-gray-500" />
            </div>
            <h2 className="text-[20px] font-bold text-gray-900 mb-2">{activeItem}</h2>
            <p className="text-[14px] text-gray-500 max-w-[400px]">
              This section is currently under development. Configure your {activeItem.toLowerCase()} settings here soon.
            </p>
          </div>
        )

    }
  }

  return (
    <div className="absolute inset-0 flex bg-gray-100/10 overflow-hidden">
      
      {/* Settings Subnav */}
      <div className="w-[220px] bg-card border-r border-border py-6 flex-shrink-0 h-full overflow-y-auto">
        <h2 className="text-[16px] font-bold text-gray-900 px-5 mb-4">Settings</h2>
        
        <div className="space-y-6">
          {navGroups.map(group => (
            <div key={group.group_label}>
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase px-5 mb-2 tracking-wider">
                {group.group_label}
              </h3>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <button
                    key={item.label}
                    onClick={() => setActiveItem(item.label)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-5 py-2.5 text-[14px] transition-colors relative",
                      activeItem === item.label
                        ? "bg-primary/10 text-gray-900 font-medium"
                        : "text-gray-500 hover:bg-gray-100"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    {activeItem === item.label && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0">
        <div className="flex-1 overflow-y-auto p-8 relative">
          {renderContent()}
        </div>
        
        {/* Sticky Save Bar */}
        {["General", "Email (SMTP)", "Voice & Calling"].includes(activeItem) && (
          <div className="bg-white border-t border-border p-4 flex justify-end gap-3 shrink-0">
            <button className="px-5 py-2 border border-border rounded-lg text-[14px] font-medium text-gray-900 hover:bg-gray-100">
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 bg-primary hover:bg-primary/90 text-gray-900 font-semibold text-[14px] rounded-lg shadow-sm shadow-primary/20 disabled:opacity-50 transition-all"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
