"use client";

import { useState, useRef } from "react";
import { Phone, PhoneOff, Mic, Brain, ChevronRight, Play, Loader2, Check, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SARVAM_VOICES, GEMINI_VOICES } from "@/lib/voices";

type AgentType = "livekit" | "gemini";
type CallStatus = "idle" | "calling" | "ringing" | "active" | "ended";

export default function VoiceAgentPage() {
  const [agentType, setAgentType] = useState<AgentType>("livekit");
  const [selectedVoice, setSelectedVoice] = useState("anushka");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voices = agentType === "livekit" ? SARVAM_VOICES : GEMINI_VOICES;
  const isInCall = callStatus === "calling" || callStatus === "ringing" || callStatus === "active";

  async function handlePlaySample(voiceId: string) {
    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    setPlayingVoice(voiceId);
    try {
      const audio = new Audio(`/api/voice/voices/sample?voice=${voiceId}&lang=hi-IN`);
      audioRef.current = audio;
      audio.onended = () => setPlayingVoice(null);
      audio.onerror = () => { setPlayingVoice(null); toast.error("Sample playback failed"); };
      await audio.play();
    } catch {
      setPlayingVoice(null);
      toast.error("Could not play sample");
    }
  }

  async function handleCall() {
    const clean = phoneNumber.replace(/\D/g, "");
    if (clean.length < 10) { toast.error("Enter a valid 10-digit number"); return; }

    setCallStatus("calling");
    try {
      const res = await fetch("/api/voice/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toNumber: clean, agentType, voiceId: selectedVoice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Call failed");
      setCurrentCallId(data.callId);
      setCallStatus("ringing");
      toast.success(`📞 Calling ${phoneNumber}…`);

      // Poll for status
      pollStatus(data.callId);
    } catch (err: any) {
      setCallStatus("idle");
      toast.error(err.message);
    }
  }

  async function pollStatus(callId: string) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 60) { clearInterval(interval); setCallStatus("ended"); return; }
      try {
        const res = await fetch(`/api/voice/calls/${callId}`);
        if (!res.ok) return;
        const { call } = await res.json();
        if (call?.status === "active") setCallStatus("active");
        if (call?.status === "completed" || call?.status === "failed") {
          clearInterval(interval);
          setCallStatus("ended");
          setTimeout(() => setCallStatus("idle"), 3000);
          toast.success(call.status === "completed" ? "Call ended ✓" : "Call failed");
        }
      } catch {}
    }, 2000);
  }

  const selectedVoiceInfo = [...SARVAM_VOICES, ...GEMINI_VOICES].find(v => v.id === selectedVoice);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voice Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">Place AI-powered calls with multilingual support</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left — Dialer */}
        <div className="xl:col-span-1 space-y-4">
          {/* Agent Type */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent Engine</p>
            <div className="grid grid-cols-2 gap-2">
              {(["livekit", "gemini"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => { setAgentType(type); setSelectedVoice(type === "livekit" ? "anushka" : "Zephyr"); }}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                    agentType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {type === "livekit"
                    ? <Mic className="w-5 h-5" />
                    : <Brain className="w-5 h-5" />
                  }
                  <span className="text-xs font-semibold">
                    {type === "livekit" ? "LiveKit + Sarvam" : "Gemini Live"}
                  </span>
                </button>
              ))}
            </div>
          </div>


          {/* Phone Dialer */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phone Number</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">+91</span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value.replace(/[^\d\s\-()]/g, ""))}
                placeholder="9307512816"
                maxLength={15}
                disabled={isInCall}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-background border border-input text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 text-lg font-mono"
              />
            </div>

            {/* Selected Voice Badge */}
            {selectedVoiceInfo && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <Volume2 className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs text-primary font-medium">{selectedVoiceInfo.name}</span>
                {"style" in selectedVoiceInfo && (
                  <span className="text-xs text-muted-foreground">· {selectedVoiceInfo.style}</span>
                )}
              </div>
            )}

            {/* Call Button */}
            <button
              onClick={isInCall ? undefined : handleCall}
              disabled={isInCall || !phoneNumber}
              className={cn(
                "w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200",
                callStatus === "idle"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                  : callStatus === "ended"
                  ? "bg-green-600 text-white"
                  : "bg-destructive/80 text-white cursor-not-allowed"
              )}
            >
              {callStatus === "idle" && <><Phone className="w-4 h-4" /> Place Call</>}
              {callStatus === "calling" && <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>}
              {callStatus === "ringing" && <><Phone className="w-4 h-4 animate-bounce" /> Ringing…</>}
              {callStatus === "active" && <><PhoneOff className="w-4 h-4" /> In Call</>}
              {callStatus === "ended" && <><Check className="w-4 h-4" /> Call Ended</>}
            </button>

            {/* Status Indicator */}
            {isInCall && (
              <div className="flex items-center gap-2 justify-center">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">
                  {callStatus === "ringing" ? "Waiting for answer..." : "Call in progress"}
                </span>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
            <a href="/dashboard/voice-agent/calls" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground">
              <span>Call History</span>
              <ChevronRight className="w-4 h-4" />
            </a>
            <a href="/dashboard/voice-agent/voices" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground">
              <span>Browse All Voices</span>
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Right — Voice Picker */}
        <div className="xl:col-span-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {agentType === "livekit" ? "Sarvam Voices" : "Gemini Voices"} · {voices.length} available
            </p>
            {agentType === "livekit" && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Hindi + English · Multilingual</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
            {voices.map(voice => {
              const isSelected = selectedVoice === voice.id;
              const isPlaying = playingVoice === voice.id;
              return (
                <div
                  key={voice.id}
                  onClick={() => setSelectedVoice(voice.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 group",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/30 hover:bg-muted/40"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {voice.name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                        {voice.name}
                      </span>
                      {"gender" in voice && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                          voice.gender === "Female" ? "bg-pink-500/15 text-pink-400" : "bg-blue-500/15 text-blue-400"
                        )}>{voice.gender}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{voice.style}</p>
                    {"model" in voice && (
                      <p className="text-[10px] text-muted-foreground/60">{voice.model}</p>
                    )}
                  </div>

                  {/* Play button (Sarvam only) */}
                  {agentType === "livekit" && (
                    <button
                      onClick={e => { e.stopPropagation(); handlePlaySample(voice.id); }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0",
                        isPlaying
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary opacity-0 group-hover:opacity-100"
                      )}
                      title="Play sample"
                    >
                      {isPlaying
                        ? <span className="w-2 h-2 bg-current rounded-sm" />
                        : <Play className="w-3 h-3 ml-0.5" />
                      }
                    </button>
                  )}

                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
