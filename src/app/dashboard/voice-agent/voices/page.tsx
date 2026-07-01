"use client";

import { useState, useRef } from "react";
import { Play, Pause, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SARVAM_VOICES } from "@/lib/voices";
import { PageShell } from "@/components/ui";

type VoiceFilter = "all" | "Female" | "Male";
type ModelFilter = "all" | "bulbul:v2" | "bulbul:v3-beta";

export default function VoicesPage() {
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<VoiceFilter>("all");
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
  const [langFilter, setLangFilter] = useState<"hi-IN" | "en-IN">("hi-IN");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("anushka");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = SARVAM_VOICES.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.style.toLowerCase().includes(search.toLowerCase());
    const matchGender = genderFilter === "all" || v.gender === genderFilter;
    const matchModel = modelFilter === "all" || v.model === modelFilter;
    return matchSearch && matchGender && matchModel;
  });

  async function handlePlay(voiceId: string) {
    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    // Stop any currently playing
    audioRef.current?.pause();
    setPlayingVoice(voiceId);
    try {
      const audio = new Audio(`/api/voice/voices/sample?voice=${voiceId}&lang=${langFilter}`);
      audioRef.current = audio;
      audio.onended = () => setPlayingVoice(null);
      audio.onerror = () => { setPlayingVoice(null); toast.error("Could not load sample"); };
      await audio.play();
    } catch {
      setPlayingVoice(null);
      toast.error("Playback failed");
    }
  }

  const modelLabels: Record<string, string> = {
    "bulbul:v2": "v2",
    "bulbul:v3-beta": "v3 Beta",
    "bulbul:v3": "v3",
  };
  const modelColors: Record<string, string> = {
    "bulbul:v2": "bg-blue-500/15 text-blue-400",
    "bulbul:v3-beta": "bg-purple-500/15 text-purple-400",
    "bulbul:v3": "bg-emerald-500/15 text-emerald-400",
  };

  return (
    <PageShell size="medium">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voice Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {SARVAM_VOICES.length} Sarvam AI voices — click ▶ to hear a sample
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search voices…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Gender filter */}
        {(["all", "Female", "Male"] as VoiceFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setGenderFilter(f)}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all",
              genderFilter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "all" ? "All Genders" : f}
          </button>
        ))}

        {/* Model filter */}
        {(["all", "bulbul:v2", "bulbul:v3-beta"] as ModelFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setModelFilter(f)}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-all",
              modelFilter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "all" ? "All Models" : modelLabels[f] || f}
          </button>
        ))}

        {/* Lang toggle for sample */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 ml-auto">
          {(["hi-IN", "en-IN"] as const).map(l => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                langFilter === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l === "hi-IN" ? "🇮🇳 Hindi" : "🇬🇧 English"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="text-xs text-muted-foreground">
        Showing {filtered.length} of {SARVAM_VOICES.length} voices
      </div>

      {/* Voice grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(voice => {
          const isSelected = selectedVoice === voice.id;
          const isPlaying = playingVoice === voice.id;

          return (
            <div
              key={voice.id}
              className={cn(
                "relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 group",
                isSelected
                  ? "border-primary bg-primary/5 shadow-[0_0_0_3px] shadow-primary/20"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
              )}
              onClick={() => setSelectedVoice(voice.id)}
            >
              {/* Top row: Avatar + badges */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold",
                    voice.gender === "Female"
                      ? "bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-pink-400"
                      : "bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400"
                  )}>
                    {voice.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{voice.name}</p>
                    <p className="text-xs text-muted-foreground">{voice.style}</p>
                  </div>
                </div>

                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                  voice.gender === "Female" ? "bg-pink-500/10 text-pink-400" : "bg-blue-500/10 text-blue-400"
                )}>
                  {voice.gender}
                </span>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", modelColors[voice.model] || "bg-muted text-muted-foreground")}>
                  {modelLabels[voice.model] || voice.model}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {voice.language}
                </span>
              </div>

              {/* Play button */}
              <button
                onClick={e => { e.stopPropagation(); handlePlay(voice.id); }}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all",
                  isPlaying
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary"
                )}
              >
                {isPlaying ? (
                  <><Pause className="w-3 h-3" /> Stop</>
                ) : (
                  <><Play className="w-3 h-3" /> Play Sample</>
                )}
              </button>

              {/* Playing wave indicator */}
              {isPlaying && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary rounded-b-2xl animate-pulse" />
              )}
            </div>
          );
        })}
      </div>

      {/* Selected voice callout */}
      {selectedVoice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-card border border-primary/40 shadow-lg rounded-2xl px-4 py-3">
            <Check className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Selected: <span className="text-primary">{SARVAM_VOICES.find(v => v.id === selectedVoice)?.name}</span>
            </span>
            <a
              href="/dashboard/voice-agent"
              className="ml-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Use This Voice →
            </a>
          </div>
        </div>
      )}
    </PageShell>
  );
}
