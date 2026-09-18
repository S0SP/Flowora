"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Building2, Smartphone, Users, Rocket,
  ArrowRight, ArrowLeft, Check, Upload, Plus, ChevronDown,
  MessageSquare, Mail, Globe, FileSpreadsheet, Zap
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import Papa from "papaparse"
import { ThemeToggle } from "@/components/ThemeToggle"


const STEPS = [
  { id: 1, label: "Workspace", icon: Building2, description: "Tell us about your company" },
  { id: 2, label: "WhatsApp", icon: Smartphone, description: "Connect your WhatsApp" },
  { id: 3, label: "Contacts", icon: Users, description: "Import your leads" },
  { id: 4, label: "Go Live", icon: Rocket, description: "Launch your AI agent" },
]

const INDUSTRIES = [
  "Real Estate", "E-Commerce", "Education", "Healthcare", "Financial Services",
  "Travel & Hospitality", "Insurance", "Automotive", "Retail", "Technology",
  "Marketing Agency", "HR & Recruitment", "Other"
]



export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    document.cookie = "fw_ws=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    router.push("/auth/login")
  }

  const [step, setStep] = useState(1)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  // Step 1 state
  const [companyName, setCompanyName] = useState("")
  const [industry, setIndustry] = useState("")
  const [industryOpen, setIndustryOpen] = useState(false)

  // Step 2 state
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [skipWA, setSkipWA] = useState(false)

  // Step 3 state
  const [importMethod, setImportMethod] = useState<"csv" | "sheet" | "skip">("skip")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/workspaces")
      .then(res => res.json())
      .then(data => {
        if (data.activeWorkspace) {
          setWorkspaceId(data.activeWorkspace.id)
          setCompanyName(data.activeWorkspace.name)
          document.cookie = `fw_ws=${data.activeWorkspace.id}; path=/; samesite=lax`
          // NOTE: Do NOT redirect to /dashboard here — if the user is already fully onboarded,
          // the Next.js middleware will redirect them to /dashboard automatically.
          // Redirecting here caused an infinite loop:
          //   useEffect → /dashboard → middleware → /onboarding → useEffect → repeat
          if (!data.activeWorkspace.onboarding_completed) {
            // Workspace exists but onboarding not complete — skip to step 2
            setStep(prev => (prev === 1 ? 2 : prev))
          }
          // If onboarding IS complete, the middleware will redirect; just wait.
        }
      })
      .catch(() => {})
  }, [])

  const handleSkipToDashboard = async () => {
    let activeWsId = workspaceId
    setSaving(true)
    try {
      if (!activeWsId && companyName.trim()) {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: companyName.trim(), industry }),
        })
        const data = await res.json()
        if (data.workspaceId) activeWsId = data.workspaceId
      }
      if (!activeWsId) {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "My Workspace" }),
        })
        const data = await res.json()
        if (data.workspaceId) activeWsId = data.workspaceId
      }
      const patchRes = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWsId }),
      })
      const patchData = await patchRes.json()
      if (!patchRes.ok) throw new Error(patchData.error ?? "Failed to complete onboarding")
      const finalWsId = patchData.workspaceId || activeWsId
      if (finalWsId) {
        document.cookie = `fw_ws=${finalWsId}; path=/; samesite=lax`
      }
      window.location.href = "/dashboard"
    } catch (err: any) {
      toast.error(err.message ?? "Failed to skip onboarding")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateWorkspace = async () => {
    if (!companyName.trim()) { toast.error("Company name is required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName.trim(), industry }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create workspace")
      setWorkspaceId(data.workspaceId)
      document.cookie = `fw_ws=${data.workspaceId}; path=/; samesite=lax`
      setStep(2)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConnectWhatsApp = async () => {
    if (!skipWA && (!phoneNumberId || !wabaId || !accessToken)) {
      toast.error("Fill all WhatsApp credentials or skip for now")
      return
    }
    if (!skipWA && workspaceId) {
      setSaving(true)
      try {
        await fetch("/api/settings/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            type: "whatsapp",
            config: { phoneNumberId, wabaId },
            secrets: { accessToken },
          }),
        })
      } catch {}
      setSaving(false)
    }
    setStep(3)
  }

  const handleContactsContinue = () => {
    if (importMethod === 'csv' && csvFile) {
      setIsImporting(true)
      const reader = new FileReader()
      reader.onload = (e) => {
        Papa.parse(e.target?.result as string, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            const parsed = results.data.map((row: any) => {
              const name = row.name || row.Name || row.full_name || row["Contact Name"] || "";
              const phone = row.phone || row.Phone || row["Phone Number"] || "";
              const email = row.email || row.Email || "";
              const company = row.company || row.Company || "";
              const status = row.status || row.Status || "Lead";
              const tags = row.tags || row.Tags ? String(row.tags || row.Tags).split(";").map((t: string) => t.trim()) : [];
              return { name, phone, email, company, status, tags };
            }).filter((x: any) => x.phone && x.name)

            if (parsed.length === 0) {
              toast.error("No valid contacts found in CSV. Make sure you have 'name' and 'phone' columns.")
              setIsImporting(false)
              return
            }

            try {
              const res = await fetch("/api/contacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed)
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data.error ?? "Failed to save imported contacts")
              toast.success(`Imported ${data.contacts?.length ?? 0} contacts successfully!`)
              setStep(4)
            } catch (err: any) {
              toast.error(err.message)
            } finally {
              setIsImporting(false)
            }
          }
        })
      }
      reader.readAsText(csvFile)
    } else {
      setStep(4)
    }
  }

  const handleComplete = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to complete onboarding")
      const finalWsId = data.workspaceId || workspaceId
      if (finalWsId) {
        document.cookie = `fw_ws=${finalWsId}; path=/; samesite=lax`
      }
      toast.success("🎉 Your workspace is live!")
      await new Promise(r => setTimeout(r, 400))
      window.location.href = "/dashboard"
    } catch (err: any) {
      toast.error(err.message ?? "Failed to complete onboarding")
    } finally {
      setSaving(false)
    }
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border flex items-center px-6">
        <div className="flex items-center gap-2.5">
          <img src="/image/flowra_expanded_transparent.png" alt="Flowra Logo" className="h-8 w-auto object-contain dark:hidden" />
          <img src="/image/flowra_expanded_dark.png" alt="Flowra Logo" className="h-8 w-auto object-contain hidden dark:block" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <span className="text-xs text-muted-foreground hidden sm:inline">Step {step} of {STEPS.length}</span>
          <button
            onClick={handleSkipToDashboard}
            disabled={saving}
            className="text-xs font-medium text-foreground/80 hover:text-primary transition-colors border border-border rounded-lg px-3 py-1.5 hover:bg-muted"
          >
            Skip setup →
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-destructive hover:text-destructive/80 transition-colors border border-destructive/20 hover:border-destructive/40 rounded-lg px-2.5 py-1.5"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex-1 flex">
        {/* Left stepper */}
        <div className="hidden md:flex flex-col w-64 bg-card border-r border-border p-8 gap-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-4">Setup guide</p>
          {STEPS.map((s) => {
            const Icon = s.icon
            const done = step > s.id
            const active = step === s.id
            return (
              <div key={s.id} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${active ? "bg-primary/10 border border-primary/20" : "border border-transparent"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                  ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {done
                    ? <Check className="w-4 h-4 text-primary-foreground" />
                    : <Icon className={`w-4 h-4 ${active ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  }
                </div>
                <div>
                  <p className={`text-sm font-semibold ${active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground"}`}>{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                {/* Step 1: Company */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Set up your workspace</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm">Tell us a bit about your company to personalize your experience.</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Company name *</label>
                        <input
                          value={companyName}
                          onChange={e => setCompanyName(e.target.value)}
                          placeholder="Acme Corp"
                          className="w-full px-4 py-2.5 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-card placeholder-muted-foreground"
                        />
                      </div>

                      <div className="relative">
                        <label className="block text-sm font-semibold text-foreground mb-1.5">Industry</label>
                        <button
                          type="button"
                          onClick={() => setIndustryOpen(!industryOpen)}
                          className="w-full flex items-center justify-between px-4 py-2.5 border border-border rounded-xl text-sm bg-card hover:border-primary transition-colors"
                        >
                          <span className={industry ? "text-foreground" : "text-muted-foreground"}>{industry || "Select your industry"}</span>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${industryOpen ? "rotate-180" : ""}`} />
                        </button>
                        {industryOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-52 overflow-y-auto">
                            {INDUSTRIES.map(ind => (
                              <button
                                key={ind}
                                type="button"
                                onClick={() => { setIndustry(ind); setIndustryOpen(false) }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors ${industry === ind ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}
                              >
                                {ind}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={handleCreateWorkspace}
                      disabled={saving || !companyName.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-60"
                    >
                      {saving ? "Creating..." : "Create Workspace"}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Step 2: WhatsApp */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Connect WhatsApp</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm">Add your Meta WhatsApp Business API credentials to start sending messages.</p>
                    </div>

                    <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-sm text-foreground/80">
                      💡 You can skip this now and add credentials later in Settings → Channels.
                    </div>

                    <div className="space-y-4">
                      {[
                        { key: "phoneNumberId", label: "Phone Number ID", value: phoneNumberId, set: setPhoneNumberId },
                        { key: "wabaId", label: "WhatsApp Business Account ID", value: wabaId, set: setWabaId },
                        { key: "accessToken", label: "Permanent Access Token", value: accessToken, set: setAccessToken },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-sm font-semibold text-foreground mb-1.5">{f.label}</label>
                          <input
                            type={f.key === "accessToken" ? "password" : "text"}
                            value={f.value}
                            onChange={e => { f.set(e.target.value); setSkipWA(false) }}
                            placeholder={f.key === "accessToken" ? "EAA..." : ""}
                            disabled={skipWA}
                            className="w-full px-4 py-2.5 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-card disabled:opacity-50"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setSkipWA(true); setStep(3) }}
                        className="flex-1 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Skip for now
                      </button>
                      <button
                        onClick={handleConnectWhatsApp}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
                      >
                        {saving ? "Saving..." : "Connect"} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Import Contacts */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-foreground">Import your contacts</h2>
                      <p className="text-muted-foreground mt-1.5 text-sm">Import existing leads to start reaching out right away.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: "csv" as const, icon: Upload, title: "Upload CSV", desc: "Import from a spreadsheet file" },
                        { id: "sheet" as const, icon: FileSpreadsheet, title: "Google Sheet", desc: "Sync contacts from a Google Sheet" },
                        { id: "skip" as const, icon: Plus, title: "Add manually later", desc: "Start fresh and add contacts one by one" },
                      ].map(opt => (
                        <div key={opt.id}>
                          <button
                            onClick={() => setImportMethod(opt.id)}
                            className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all
                              ${importMethod === opt.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"}`}
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                              ${importMethod === opt.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                              <opt.icon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm text-foreground">{opt.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                            </div>
                            {importMethod === opt.id && <Check className="w-5 h-5 text-primary ml-auto" />}
                          </button>
                          {importMethod === 'csv' && opt.id === 'csv' && (
                            <div className="mt-3 p-4 border border-border rounded-xl bg-card">
                              <input
                                type="file"
                                accept=".csv"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                              />
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => fileInputRef.current?.click()}
                                  className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-lg text-sm transition-colors border border-border"
                                >
                                  Choose File
                                </button>
                                <span className="text-sm text-muted-foreground truncate">
                                  {csvFile ? csvFile.name : "No file chosen"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep(2)} className="px-6 py-3 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={handleContactsContinue}
                        disabled={isImporting || (importMethod === 'csv' && !csvFile)}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-60"
                      >
                        {isImporting ? "Importing..." : "Continue"} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Go Live */}
                {step === 4 && (
                  <div className="space-y-8 text-center">
                    <div>
                      <div className="w-20 h-20 bg-primary/10 border-2 border-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Rocket className="w-10 h-10 text-primary" />
                      </div>
                      <h2 className="text-2xl font-bold text-foreground">You're all set! 🎉</h2>
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed max-w-md mx-auto">
                        Your Flowora workspace is ready. Your AI agent will start handling conversations, qualifying leads, and booking appointments automatically.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      {[
                        { label: "Trial Credits", value: "1,000", color: "#10B981" },
                        { label: "Channels", value: skipWA ? "0" : "1", color: "#6366F1" },
                        { label: "Workflows", value: "0", color: "#3B82F6" },
                      ].map(s => (
                        <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                          <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                          <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleComplete}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 rounded-xl transition-all text-base shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-60"
                    >
                      {saving ? "Launching..." : "Go to Dashboard"}
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
