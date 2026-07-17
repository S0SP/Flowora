"use client"

import React, { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Mic, Zap, List, Phone, Clock, TrendingUp, CheckCircle2, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const stats = [
  { icon: Phone, label: "Total Calls Made", value: "1,284", change: "+18.2% this week", changeColor: "text-green-500", bg: "bg-[#F3EFFF] text-[#6C47FF]" },
  { icon: Clock, label: "Avg Call Duration", value: "3m 24s", subtext: "vs 2m 48s last week", bg: "bg-[#F3EFFF] text-[#6C47FF]" },
  { icon: TrendingUp, label: "Conversion Rate", value: "22.4%", change: "+4.1%", changeColor: "text-green-500", bg: "bg-[#E6F4EA] text-[#137333]" },
  { icon: Mic, label: "Credits Used (Voice)", value: "19,260", subtext: "this month", bg: "bg-[#F3EFFF] text-[#6C47FF]" },
]

const voiceFilters = ["All", "Female", "Male", "Professional", "Friendly"]

const voices = [
  { id: "sophia", name: "Sophia", gender: "Female", tone: "Professional", gradient: "from-[#6C47FF] to-[#8868FF]", initials: "S", waveColor: "bg-[#6C47FF]", genderBg: "bg-[#F3EFFF]", genderText: "text-[#6C47FF]" },
  { id: "maya", name: "Maya", gender: "Female", tone: "Friendly", gradient: "from-[#B1D8FC] to-[#7CB9F9]", initials: "M", waveColor: "bg-[#B1D8FC]", genderBg: "bg-[#F3EFFF]", genderText: "text-[#6C47FF]" },
  { id: "emma", name: "Emma", gender: "Female", tone: "Warm", gradient: "from-[#FDE68A] to-[#FBBF24]", initials: "E", waveColor: "bg-[#FDE68A]", genderBg: "bg-[#F3EFFF]", genderText: "text-[#6C47FF]" },
  { id: "ryan", name: "Ryan", gender: "Male", tone: "Professional", gradient: "from-[#1B1B1B] to-[#404040]", initials: "R", waveColor: "bg-[#404040]", genderBg: "bg-muted", genderText: "text-muted-foreground" },
  { id: "alex", name: "Alex", gender: "Male", tone: "Friendly", gradient: "from-[#A7F3D0] to-[#34D399]", initials: "A", waveColor: "bg-[#A7F3D0]", genderBg: "bg-muted", genderText: "text-muted-foreground" },
  { id: "james", name: "James", gender: "Male", tone: "Executive", gradient: "from-[#FCA5A5] to-[#F87171]", initials: "J", waveColor: "bg-[#FCA5A5]", genderBg: "bg-muted", genderText: "text-muted-foreground" },
]

const voiceSettingsSchema = z.object({
  callType: z.enum(["phone_call", "whatsapp_call"]),
  voiceId: z.string()
})

type VoiceSettingsValues = z.infer<typeof voiceSettingsSchema>

export default function VoiceAgentPage() {
  const [activeFilter, setActiveFilter] = useState("All")

  const { control, handleSubmit, formState: { isSubmitting }, watch } = useForm<VoiceSettingsValues>({
    resolver: zodResolver(voiceSettingsSchema),
    defaultValues: {
      callType: "phone_call",
      voiceId: "sophia"
    }
  })

  const selectedCallType = watch("callType")
  const selectedVoice = watch("voiceId")

  const onSave = async (data: VoiceSettingsValues) => {
    await new Promise(r => setTimeout(r, 500))
    toast.success("Voice agent settings saved successfully!")
    console.log("Voice Settings:", data)
  }

  // Filter voices based on active filter
  const filteredVoices = voices.filter(v => {
    if (activeFilter === "All") return true
    if (activeFilter === "Female" || activeFilter === "Male") return v.gender === activeFilter
    return v.tone === activeFilter
  })

  return (
    <form onSubmit={handleSubmit(onSave)} className="flex flex-col min-h-0 flex-1 overflow-y-auto bg-[#FAFAFA] p-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      
      <div className="max-w-6xl mx-auto w-full space-y-8">
        
        {/* Header Card */}
        <div className="bg-white rounded-xl border border-border border-l-4 border-l-[#6C47FF] p-6 shadow-sm flex items-start justify-between">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full bg-[#F3EFFF] flex items-center justify-center shrink-0">
              <Mic className="h-6 w-6 text-[#6C47FF]" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground">AI Voice Agent</h1>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[12px] font-medium text-amber-600">~15 credits per minute</span>
                </div>
              </div>
              <p className="text-[14px] text-muted-foreground">
                Your AI-powered voice assistant for lead conversion and retention — via phone call and WhatsApp.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button type="button" className="px-4 py-2 border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-2">
              <List className="h-4 w-4" /> View Call Logs
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#6C47FF] rounded-lg text-[14px] font-bold text-white hover:bg-[#6C47FF]/90 shadow-sm transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-border p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", stat.bg)}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <span className="text-[14px] font-medium text-muted-foreground">{stat.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                {stat.change && (
                  <span className={cn("text-[13px] font-medium", stat.changeColor)}>{stat.change}</span>
                )}
                {stat.subtext && (
                  <span className="text-[13px] text-muted-foreground">{stat.subtext}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="w-full h-px bg-border" />

        {/* Call Type Selection */}
        <div>
          <h2 className="text-[18px] font-bold text-foreground mb-1">Call Type</h2>
          <p className="text-[13px] text-muted-foreground mb-4">Choose how your AI agent will reach leads</p>

          <Controller
            name="callType"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-6">
                {/* Phone Call */}
                <div 
                  className={cn(
                    "rounded-xl p-5 cursor-pointer transition-all bg-white relative",
                    field.value === "phone_call" ? "border-2 border-[#6C47FF] shadow-sm" : "border border-border hover:border-[#6C47FF]"
                  )}
                  onClick={() => field.onChange("phone_call")}
                >
                  {field.value === "phone_call" && (
                    <div className="absolute top-4 right-4">
                      <CheckCircle2 className="h-5 w-5 text-[#6C47FF]" />
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <Phone className="h-7 w-7 text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-bold text-foreground">Normal Phone Call</h3>
                        <span className="bg-[#E6F4EA] text-[#137333] text-[10px] font-bold px-2 py-0.5 rounded">Most Effective</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                        AI agent calls lead's mobile number directly. Best for immediate, high-urgency outreach.
                      </p>
                      <ul className="space-y-1.5">
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Works on any mobile number
                        </li>
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Higher answer rate
                        </li>
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Full call recording + transcript
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Call */}
                <div 
                  className={cn(
                    "rounded-xl p-5 cursor-pointer transition-all bg-white relative",
                    field.value === "whatsapp_call" ? "border-2 border-[#6C47FF] shadow-sm" : "border border-border hover:border-[#6C47FF]"
                  )}
                  onClick={() => field.onChange("whatsapp_call")}
                >
                  {field.value === "whatsapp_call" && (
                    <div className="absolute top-4 right-4">
                      <CheckCircle2 className="h-5 w-5 text-[#6C47FF]" />
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                      <Phone className="h-7 w-7 text-green-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-bold text-foreground">WhatsApp Voice Call</h3>
                        <span className="bg-[#E6F4EA] text-[#137333] text-[10px] font-bold px-2 py-0.5 rounded">WhatsApp API</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                        AI agent calls via WhatsApp. Lead must have WhatsApp installed. Great for warm leads.
                      </p>
                      <ul className="space-y-1.5">
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Familiar WhatsApp interface
                        </li>
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Higher trust from known brand
                        </li>
                        <li className="text-[13px] text-muted-foreground flex items-center gap-2">
                          <span className="text-[#137333]">✓</span> Call + chat follow-up in one thread
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          />
        </div>

        <div className="w-full h-px bg-border" />

        {/* Voice Selection */}
        <div>
          <h2 className="text-[18px] font-bold text-foreground mb-1">Select Voice</h2>
          <p className="text-[13px] text-muted-foreground mb-5">Choose your AI agent's voice. Preview before selecting.</p>
          
          {/* Filters */}
          <div className="flex items-center gap-2 mb-6">
            {voiceFilters.map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                  activeFilter === filter 
                    ? "bg-[#F3EFFF] border-[#6C47FF] text-[#6C47FF]"
                    : "bg-white border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Voice Cards Grid */}
          <Controller
            name="voiceId"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-5">
                {filteredVoices.map(voice => (
                  <div 
                    key={voice.id}
                    onClick={() => field.onChange(voice.id)}
                    className={cn(
                      "bg-white rounded-xl p-4 cursor-pointer transition-all relative flex flex-col items-center text-center",
                      field.value === voice.id ? "border-2 border-[#6C47FF] shadow-sm" : "border border-border hover:border-[#6C47FF]"
                    )}
                  >
                    {field.value === voice.id && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 className="h-5 w-5 text-[#6C47FF]" />
                      </div>
                    )}
                    
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-3 bg-gradient-to-br shadow-sm", voice.gradient)}>
                      {voice.initials}
                    </div>
                    
                    <h3 className="text-[15px] font-bold text-foreground mb-2">{voice.name}</h3>
                    
                    <div className="flex items-center gap-2 mb-4">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded", voice.genderBg, voice.genderText)}>{voice.gender}</span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">{voice.tone}</span>
                    </div>

                    {/* Waveform preview (static visual) */}
                    <div className="w-full flex items-end justify-center gap-[2px] h-6 mb-4 px-4 opacity-70">
                      {Array.from({length: 16}).map((_, i) => (
                        <div 
                          key={i} 
                          className={cn("w-1.5 rounded-full", voice.waveColor)} 
                          style={{ height: `${Math.max(10, Math.random() * 100)}%`, transition: "height 0.2s ease-in-out" }}
                        />
                      ))}
                    </div>

                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); toast("Playing voice preview..."); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-md text-[12px] font-medium text-foreground hover:bg-muted transition-colors w-full justify-center"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Preview
                    </button>

                  </div>
                ))}
              </div>
            )}
          />

        </div>

      </div>
    </form>
  )
}
