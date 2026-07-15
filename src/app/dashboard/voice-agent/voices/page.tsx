"use client";

import { useState, useRef } from "react";
import { Play, Pause, Check, Search, SlidersHorizontal, Users, Globe, Zap, Mic } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SARVAM_VOICES, GEMINI_VOICES } from "@/lib/voices";
import { PageShell } from "@/components/ui";

type GenderFilter = "All" | "Female" | "Male";
type StyleFilter = "All" | "Customer Care" | "Content" | "International" | "Professional" | "Bright" | "Upbeat" | "Firm" | "Friendly" | "Warm";
type LangFilter = "All" | "Hindi/English" | "English";
type ProviderFilter = "All" | "Sarvam" | "Gemini";

const MODEL_LABELS: Record<string, string> = {
  "bulbul:v2": "Sarvam v2",
  "bulbul:v3-beta": "Sarvam v3",
};

const MODEL_COLORS: Record<string, string> = {
  "bulbul:v2": "bg-blue-500/10 text-blue-600",
  "bulbul:v3-beta": "bg-violet-500/10 text-violet-600",
};

// Enrich Sarvam voices with extra metadata
type SarvamVoiceEnriched = typeof SARVAM_VOICES[number] & { provider: "Sarvam" };
type GeminiVoiceEnriched = typeof GEMINI_VOICES[number] & { provider: "Gemini"; gender?: string; language?: string; model?: string };
type AnyVoice = SarvamVoiceEnriched | GeminiVoiceEnriched;

const ALL_VOICES: AnyVoice[] = [
  ...SARVAM_VOICES.map(v => ({ ...v, provider: "Sarvam" as const })),
  ...GEMINI_VOICES.map(v => ({ ...v, provider: "Gemini" as const })),
];

const STYLE_GROUPS = [
  { label: "Customer Care", icon: Users, color: "text-green-600 bg-green-50" },
  { label: "Content", icon: Mic, color: "text-purple-600 bg-purple-50" },
  { label: "International", icon: Globe, color: "text-blue-600 bg-blue-50" },
  { label: "Professional", icon: Zap, color: "text-amber-600 bg-amber-50" },
];

export default function VoicesPage() {
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState<GenderFilter>("All");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("All");
  const [langFilter, setLangFilter] = useState<LangFilter>("All");
  const [provider, setProvider] = useState<ProviderFilter>("All");
  const [sampleLang, setSampleLang] = useState<"hi-IN" | "en-IN">("hi-IN");
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("anushka");
  const [viewMode, setViewMode] = useState<"grid" | "grouped">("grouped");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = ALL_VOICES.filter(v => {
    const s = search.toLowerCase();
    const matchSearch = v.name.toLowerCase().includes(s) || v.style.toLowerCase().includes(s);
    const matchGender = gender === "All" || (("gender" in v) && v.gender === gender);
    const matchStyle = styleFilter === "All" || v.style.toLowerCase().includes(styleFilter.toLowerCase());
    const matchLang = langFilter === "All" || (("language" in v) && v.language === langFilter);
    const matchProvider = provider === "All" || v.provider === provider;
    return matchSearch && matchGender && matchStyle && matchLang && matchProvider;
  });

  async function handlePlay(voiceId: string, voiceProvider: string) {
    if (playingVoice === voiceId) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingVoice(voiceId);
    try {
      const audio = new Audio(`/api/voice/voices/sample?voice=${voiceId}&lang=${sampleLang}`);
      audioRef.current = audio;
      audio.onended = () => setPlayingVoice(null);
      audio.onerror = () => { setPlayingVoice(null); toast.error("Could not load sample"); };
      await audio.play();
    } catch {
      setPlayingVoice(null);
      toast.error("Playback failed");
    }
  }

  function VoiceCard({ voice }: { voice: AnyVoice }) {
    const isSelected = selectedVoice === voice.id;
    const isPlaying = playingVoice === voice.id;
    const isSarvam = voice.provider === "Sarvam";
    const voiceGender = ("gender" in voice) ? voice.gender : undefined;
    const voiceModel = ("model" in voice) ? voice.model : undefined;
    const voiceLang = ("language" in voice) ? voice.language : "English";

    return (
      <div
        onClick={() => setSelectedVoice(voice.id)}
        className={cn(
          "relative rounded-2xl border p-4 cursor-pointer transition-all duration-200 group",
          isSelected
            ? "border-primary bg-primary/5 shadow-[0_0_0_2px] shadow-primary/30"
            : "border-border bg-card hover:border-primary/40 hover:bg-muted/20"
        )}
      >
        {/* Top */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shrink-0",
              voiceGender === "Female"
                ? "bg-gradient-to-br from-pink-100 to-purple-100 text-pink-600"
                : voiceGender === "Male"
                ? "bg-gradient-to-br from-blue-100 to-cyan-100 text-blue-600"
                : "bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600"
            )}>
              {voice.name[0]}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[14px] text-foreground leading-tight">{voice.name}</p>
              <p className="text-[12px] text-muted-foreground truncate max-w-[120px]">{voice.style}</p>
            </div>
          </div>
          {isSelected && (
            <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-primary-foreground" />
            </span>
          )}
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {voiceGender && (
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
              voiceGender === "Female" ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
            )}>
              {voiceGender}
            </span>
          )}
          {voiceModel && (
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", MODEL_COLORS[voiceModel] ?? "bg-muted text-muted-foreground")}>
              {MODEL_LABELS[voiceModel] ?? voiceModel}
            </span>
          )}
          {!voiceModel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-600">
              Gemini
            </span>
          )}
          {voiceLang && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              {voiceLang}
            </span>
          )}
        </div>

        {/* Play */}
        <button
          onClick={e => { e.stopPropagation(); handlePlay(voice.id, voice.provider); }}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-medium transition-all",
            isPlaying
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
          )}
        >
          {isPlaying ? <><Pause className="w-3 h-3" /> Stop</> : <><Play className="w-3 h-3" /> Preview</>}
        </button>

        {isPlaying && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-primary rounded-b-2xl animate-pulse" />
        )}
      </div>
    );
  }

  // Group by style for grouped view
  const grouped: Record<string, AnyVoice[]> = {};
  filtered.forEach(v => {
    const cat = v.style.includes("Customer Care") ? "Customer Care"
      : v.style.includes("Content") ? "Content"
      : v.style === "International" ? "International"
      : v.provider === "Gemini" ? "Gemini Voices"
      : "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(v);
  });

  return (
    <PageShell size="wide">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Voice Library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ALL_VOICES.length} AI voices — {SARVAM_VOICES.length} Sarvam · {GEMINI_VOICES.length} Gemini
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sample language */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button onClick={() => setSampleLang("hi-IN")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-all", sampleLang === "hi-IN" ? "bg-white shadow text-foreground" : "text-muted-foreground")}>🇮🇳 Hindi</button>
            <button onClick={() => setSampleLang("en-IN")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-all", sampleLang === "en-IN" ? "bg-white shadow text-foreground" : "text-muted-foreground")}>🇬🇧 English</button>
          </div>
          {/* View mode */}
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            <button onClick={() => setViewMode("grouped")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-all", viewMode === "grouped" ? "bg-white shadow text-foreground" : "text-muted-foreground")}>Grouped</button>
            <button onClick={() => setViewMode("grid")} className={cn("px-2.5 py-1 rounded-lg text-xs font-medium transition-all", viewMode === "grid" ? "bg-white shadow text-foreground" : "text-muted-foreground")}>Grid</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search by name or style…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Provider */}
        <div className="flex items-center gap-1">
          {(["All", "Sarvam", "Gemini"] as ProviderFilter[]).map(f => (
            <button key={f} onClick={() => setProvider(f)} className={cn("px-3 py-2 rounded-xl text-sm font-medium transition-all",
              provider === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}>{f}</button>
          ))}
        </div>

        {/* Gender */}
        <div className="flex items-center gap-1">
          {(["All", "Female", "Male"] as GenderFilter[]).map(f => (
            <button key={f} onClick={() => setGender(f)} className={cn("px-3 py-2 rounded-xl text-sm font-medium transition-all",
              gender === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}>{f}</button>
          ))}
        </div>

        {/* Language */}
        <div className="flex items-center gap-1">
          {(["All", "Hindi/English", "English"] as LangFilter[]).map(f => (
            <button key={f} onClick={() => setLangFilter(f)} className={cn("px-3 py-2 rounded-xl text-sm font-medium transition-all",
              langFilter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}>{f}</button>
          ))}
        </div>

        {/* Style */}
        <div className="flex items-center gap-1 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
          {(["All", "Customer Care", "Content", "International", "Professional"] as StyleFilter[]).map(f => (
            <button key={f} onClick={() => setStyleFilter(f)} className={cn("px-3 py-2 rounded-xl text-sm font-medium transition-all",
              styleFilter === f ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            )}>{f}</button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} voices shown</p>

      {/* Voice display */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(v => <VoiceCard key={v.id} voice={v} />)}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, voices]) => {
            const groupMeta = STYLE_GROUPS.find(g => g.label === category);
            const Icon = groupMeta?.icon ?? Mic;
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", groupMeta?.color ?? "text-muted-foreground bg-muted")}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-foreground">{category}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{voices.length}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {voices.map(v => <VoiceCard key={v.id} voice={v} />)}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">No voices match your filters</p>
              <p className="text-sm mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      )}

      {/* Sticky selected banner */}
      {selectedVoice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="flex items-center gap-3 bg-card border border-primary/30 shadow-xl rounded-2xl px-4 py-3">
            <Check className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">
              <span className="text-primary font-bold">{ALL_VOICES.find(v => v.id === selectedVoice)?.name}</span> selected
            </span>
            <a href={`/dashboard/voice-agent?voice=${selectedVoice}`}
              className="ml-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Use This Voice →
            </a>
            <a href="/dashboard/workflows/builder"
              className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              Add to Workflow
            </a>
          </div>
        </div>
      )}
    </PageShell>
  );
}
