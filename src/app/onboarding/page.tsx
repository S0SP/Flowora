"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Building2, Smartphone, Users, Workflow, Rocket,
  ArrowRight, ArrowLeft, Check, Upload, Plus, ChevronDown,
  MessageSquare, Mail, Globe, FileSpreadsheet
} from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

const STEPS = [
  { id: 1, label: "Workspace", icon: Building2, description: "Tell us about your company" },
  { id: 2, label: "WhatsApp", icon: Smartphone, description: "Connect your WhatsApp" },
  { id: 3, label: "Contacts", icon: Users, description: "Import your leads" },
  { id: 4, label: "Workflow", icon: Workflow, description: "Automate your first flow" },
  { id: 5, label: "Go Live", icon: Rocket, description: "Launch your AI agent" },
]

const INDUSTRIES = [
  "Real Estate", "E-Commerce", "Education", "Healthcare", "Financial Services",
  "Travel & Hospitality", "Insurance", "Automotive", "Retail", "Technology",
  "Marketing Agency", "HR & Recruitment", "Other"
]

const WORKFLOW_TEMPLATES = [
  {
    id: "lead_qualify",
    name: "Lead Qualification",
    description: "Automatically qualify inbound WhatsApp leads with AI",
    icon: MessageSquare,
    color: "#22C55E",
    tags: ["WhatsApp", "AI", "Popular"],
  },
  {
    id: "demo_book",
    name: "Demo Booking",
    description: "Let AI schedule demos via WhatsApp — no agent needed",
    icon: Workflow,
    color: "#C4B1F9",
    tags: ["Automation", "WhatsApp"],
  },
  {
    id: "followup_seq",
    name: "Follow-up Sequence",
    description: "5-day nurture sequence for warm leads via WhatsApp + Email",
    icon: Mail,
    color: "#B1D8FC",
    tags: ["Email", "WhatsApp", "Nurture"],
  },
  {
    id: "sheet_ingest",
    name: "Google Sheet → WhatsApp",
    description: "Auto-message new rows added to your Google Sheet",
    icon: FileSpreadsheet,
    color: "#FFE27C",
    tags: ["Sheets", "WhatsApp"],
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Clear workspace cookie if present
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

  // Step 4 state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  // -------------------------------------------------------------------------
  // Step handlers
  // -------------------------------------------------------------------------

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
      // Set workspace cookie via reload — middleware will pick it up
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

  const handleComplete = async () => {
    setSaving(true)
    try {
      await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })
      toast.success("🎉 Your workspace is live!")
      await new Promise(r => setTimeout(r, 800))
      router.push("/dashboard")
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-[#E8E8E4] flex items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#FFE27C] rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-4 h-4" fill="#1B1B1B">
              <path d="M16 2L6 8v12l10 6 10-6V8L16 2zm0 3.2L23.5 10l-7.5 4.5L8.5 10 16 5.2zM8 11.5l7 4.2v8.5L8 20V11.5zm9 12.7v-8.5l7-4.2V20l-7 4.2z"/>
            </svg>
          </div>
          <span className="font-extrabold text-[#1B1B1B] tracking-wide">Flowora</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-[#9B9B9B]">Step {step} of {STEPS.length}</span>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-red-600 hover:text-red-800 transition-colors border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-[#F4F4F2]">
        <motion.div
          className="h-full bg-[#FFE27C]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      <div className="flex-1 flex">
        {/* Left stepper */}
        <div className="hidden md:flex flex-col w-64 bg-[#1B1B1B] p-8 gap-3">
          <p className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-4">Setup guide</p>
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = step > s.id
            const active = step === s.id
            return (
              <div key={s.id} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${active ? "bg-white/10" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                  ${done ? "bg-[#22C55E]" : active ? "bg-[#FFE27C]" : "bg-white/10"}`}>
                  {done
                    ? <Check className="w-4 h-4 text-white" />
                    : <Icon className={`w-4 h-4 ${active ? "text-[#1B1B1B]" : "text-white/50"}`} />
                  }
                </div>
                <div>
                  <p className={`text-sm font-semibold ${active ? "text-white" : done ? "text-white/70" : "text-white/40"}`}>{s.label}</p>
                  <p className="text-xs text-white/30 mt-0.5">{s.description}</p>
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
                      <h2 className="text-2xl font-bold text-[#1B1B1B]">Set up your workspace</h2>
                      <p className="text-[#6B6B6B] mt-1.5 text-sm">Tell us a bit about your company to personalize your experience.</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#1B1B1B] mb-1.5">Company name *</label>
                        <input
                          value={companyName}
                          onChange={e => setCompanyName(e.target.value)}
                          placeholder="Acme Corp"
                          className="w-full px-4 py-2.5 border border-[#E8E8E4] rounded-xl text-sm focus:outline-none focus:border-[#FFE27C] focus:ring-2 focus:ring-[#FFE27C]/20 bg-white"
                        />
                      </div>

                      <div className="relative">
                        <label className="block text-sm font-semibold text-[#1B1B1B] mb-1.5">Industry</label>
                        <button
                          type="button"
                          onClick={() => setIndustryOpen(!industryOpen)}
                          className="w-full flex items-center justify-between px-4 py-2.5 border border-[#E8E8E4] rounded-xl text-sm bg-white hover:border-[#FFE27C] transition-colors"
                        >
                          <span className={industry ? "text-[#1B1B1B]" : "text-[#9B9B9B]"}>{industry || "Select your industry"}</span>
                          <ChevronDown className={`w-4 h-4 text-[#9B9B9B] transition-transform ${industryOpen ? "rotate-180" : ""}`} />
                        </button>
                        {industryOpen && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-[#E8E8E4] rounded-xl shadow-lg max-h-52 overflow-y-auto">
                            {INDUSTRIES.map(ind => (
                              <button
                                key={ind}
                                type="button"
                                onClick={() => { setIndustry(ind); setIndustryOpen(false) }}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#FAFAF8] transition-colors ${industry === ind ? "bg-[#FFF9E6] text-[#1B1B1B] font-medium" : "text-[#6B6B6B]"}`}
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
                      className="w-full flex items-center justify-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)] disabled:opacity-60"
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
                      <h2 className="text-2xl font-bold text-[#1B1B1B]">Connect WhatsApp</h2>
                      <p className="text-[#6B6B6B] mt-1.5 text-sm">Add your Meta WhatsApp Business API credentials to start sending messages.</p>
                    </div>

                    <div className="bg-[#FFF9E6] border border-[#FFE27C]/30 rounded-xl p-4 text-sm text-[#6B6B6B]">
                      💡 You can skip this now and add credentials later in Settings → Channels.
                    </div>

                    <div className="space-y-4">
                      {[
                        { key: "phoneNumberId", label: "Phone Number ID", value: phoneNumberId, set: setPhoneNumberId },
                        { key: "wabaId", label: "WhatsApp Business Account ID", value: wabaId, set: setWabaId },
                        { key: "accessToken", label: "Permanent Access Token", value: accessToken, set: setAccessToken },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-sm font-semibold text-[#1B1B1B] mb-1.5">{f.label}</label>
                          <input
                            type={f.key === "accessToken" ? "password" : "text"}
                            value={f.value}
                            onChange={e => { f.set(e.target.value); setSkipWA(false) }}
                            placeholder={f.key === "accessToken" ? "EAA..." : ""}
                            disabled={skipWA}
                            className="w-full px-4 py-2.5 border border-[#E8E8E4] rounded-xl text-sm focus:outline-none focus:border-[#FFE27C] focus:ring-2 focus:ring-[#FFE27C]/20 bg-white disabled:opacity-50"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setSkipWA(true); setStep(3) }}
                        className="flex-1 py-3 border border-[#E8E8E4] rounded-xl text-sm font-semibold text-[#6B6B6B] hover:bg-[#FAFAF8] transition-colors"
                      >
                        Skip for now
                      </button>
                      <button
                        onClick={handleConnectWhatsApp}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)]"
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
                      <h2 className="text-2xl font-bold text-[#1B1B1B]">Import your contacts</h2>
                      <p className="text-[#6B6B6B] mt-1.5 text-sm">Import existing leads to start reaching out right away.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: "csv" as const, icon: Upload, title: "Upload CSV", desc: "Import from a spreadsheet file" },
                        { id: "sheet" as const, icon: FileSpreadsheet, title: "Google Sheet", desc: "Sync contacts from a Google Sheet" },
                        { id: "skip" as const, icon: Plus, title: "Add manually later", desc: "Start fresh and add contacts one by one" },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setImportMethod(opt.id)}
                          className={`flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all
                            ${importMethod === opt.id ? "border-[#FFE27C] bg-[#FFF9E6]" : "border-[#E8E8E4] bg-white hover:border-[#FFE27C]/50"}`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center
                            ${importMethod === opt.id ? "bg-[#FFE27C]" : "bg-[#F4F4F2]"}`}>
                            <opt.icon className={`w-5 h-5 ${importMethod === opt.id ? "text-[#1B1B1B]" : "text-[#6B6B6B]"}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-[#1B1B1B]">{opt.title}</p>
                            <p className="text-xs text-[#9B9B9B] mt-0.5">{opt.desc}</p>
                          </div>
                          {importMethod === opt.id && <Check className="w-5 h-5 text-[#22C55E] ml-auto" />}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep(2)} className="px-6 py-3 border border-[#E8E8E4] rounded-xl text-sm font-semibold text-[#6B6B6B] hover:bg-[#FAFAF8] transition-colors flex items-center gap-1.5">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={() => setStep(4)}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)]"
                      >
                        Continue <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Workflow Template */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-[#1B1B1B]">Pick your first workflow</h2>
                      <p className="text-[#6B6B6B] mt-1.5 text-sm">Start with a proven template. You can customize everything later.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {WORKFLOW_TEMPLATES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedTemplate(t.id)}
                          className={`flex items-start gap-4 p-4 border-2 rounded-xl text-left transition-all
                            ${selectedTemplate === t.id ? "border-[#FFE27C] bg-[#FFF9E6]" : "border-[#E8E8E4] bg-white hover:border-[#FFE27C]/50"}`}
                        >
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.color + "20" }}>
                            <t.icon className="w-5 h-5" style={{ color: t.color }} />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-[#1B1B1B]">{t.name}</p>
                            <p className="text-xs text-[#9B9B9B] mt-0.5">{t.description}</p>
                            <div className="flex gap-1.5 mt-2">
                              {t.tags.map(tag => (
                                <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F4F2] text-[#6B6B6B]">{tag}</span>
                              ))}
                            </div>
                          </div>
                          {selectedTemplate === t.id && <Check className="w-5 h-5 text-[#22C55E] flex-shrink-0 mt-0.5" />}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep(3)} className="px-6 py-3 border border-[#E8E8E4] rounded-xl text-sm font-semibold text-[#6B6B6B] hover:bg-[#FAFAF8] transition-colors flex items-center gap-1.5">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </button>
                      <button
                        onClick={() => setStep(5)}
                        className="flex-1 flex items-center justify-center gap-2 bg-[#FFE27C] hover:bg-[#FFD84A] text-[#1B1B1B] font-semibold py-3 rounded-xl transition-all shadow-[0_2px_8px_rgba(255,226,124,0.4)]"
                      >
                        {selectedTemplate ? "Use this template" : "Skip"} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 5: Go Live */}
                {step === 5 && (
                  <div className="space-y-8 text-center">
                    <div>
                      <div className="w-20 h-20 bg-[#FFF9E6] border-2 border-[#FFE27C] rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Rocket className="w-10 h-10 text-[#FFE27C]" />
                      </div>
                      <h2 className="text-2xl font-bold text-[#1B1B1B]">You're all set! 🎉</h2>
                      <p className="text-[#6B6B6B] mt-2 text-sm leading-relaxed max-w-md mx-auto">
                        Your Flowora workspace is ready. Your AI agent will start handling conversations, qualifying leads, and booking appointments automatically.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-center">
                      {[
                        { label: "Trial Credits", value: "1,000", color: "#C4B1F9" },
                        { label: "Channels", value: skipWA ? "0" : "1", color: "#B1D8FC" },
                        { label: "Workflows", value: selectedTemplate ? "1" : "0", color: "#FFE27C" },
                      ].map(s => (
                        <div key={s.label} className="bg-white border border-[#E8E8E4] rounded-xl p-4">
                          <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                          <div className="text-xs text-[#9B9B9B] mt-1">{s.label}</div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleComplete}
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-[#1B1B1B] hover:bg-[#2a2a2a] text-white font-semibold py-4 rounded-xl transition-all text-base shadow-lg disabled:opacity-60"
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
