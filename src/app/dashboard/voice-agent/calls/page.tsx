"use client";

import { useEffect, useState, useRef } from "react";
import {
  Phone, Play, Pause, ChevronDown, ChevronUp,
  Clock, Mic, Brain, Download, IndianRupee,
  Waves, MessageSquare, Cpu, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PageShell } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostBreakdown {
  total_inr: number;
  breakdown: {
    call_pulse?: {
      pulses: number;
      rate_per_pulse_inr: number;
      cost_inr: number;
      note?: string;
    };
    stt_deepgram?: {
      provider: string;
      duration_seconds: number;
      duration_mins: number;
      rate_per_min_inr: number;
      cost_inr: number;
    };
    tts_sarvam?: {
      provider: string;
      characters: number;
      rate_per_1k_chars_inr: number;
      cost_inr: number;
    };
    llm?: {
      provider: string;
      model: string;
      estimated_input_tokens: number;
      estimated_output_tokens: number;
      cost_inr: number;
      note?: string;
    };
  };
}

interface VoiceCall {
  id: string;
  phone_number: string;
  agent_type: string;
  voice_id: string;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  cost_breakdown: CostBreakdown | null;
  created_at: string;
}

// ── Status styles ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  initiated: "bg-primary/15 text-primary",
  ringing:   "bg-blue-500/15 text-blue-400",
  active:    "bg-emerald-500/15 text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-destructive/15 text-destructive",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmt(n: number) {
  return `₹${n.toFixed(4)}`;
}

// ── Audio player ───────────────────────────────────────────────────────────────

function AudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else         { a.play();  setPlaying(true);  }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          setCurrentTime(a.currentTime);
          setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
        }}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 hover:bg-primary/80 transition-colors"
      >
        {playing
          ? <Pause className="w-3.5 h-3.5 text-primary-foreground" />
          : <Play  className="w-3.5 h-3.5 text-primary-foreground ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-1.5 bg-border rounded-full overflow-hidden cursor-pointer"
          onClick={seek}
        >
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatDuration(Math.floor(currentTime))}</span>
          {duration > 0 && <span>{formatDuration(Math.floor(duration))}</span>}
        </div>
      </div>

      <a
        href={url}
        download
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Download recording"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ── Cost breakdown panel ───────────────────────────────────────────────────────

function CostPanel({ cost }: { cost: CostBreakdown }) {
  const { breakdown, total_inr } = cost;

  const rows: { icon: React.ReactNode; label: string; detail: string; amount: number }[] = [];

  if (breakdown.call_pulse) {
    const p = breakdown.call_pulse;
    rows.push({
      icon:   <Radio className="w-3.5 h-3.5 text-blue-400" />,
      label:  "Call Pulse",
      detail: `${p.pulses} pulse${p.pulses !== 1 ? "s" : ""} × ₹${p.rate_per_pulse_inr} (ceil-minute billing)`,
      amount: p.cost_inr,
    });
  }
  if (breakdown.stt_deepgram) {
    const s = breakdown.stt_deepgram;
    rows.push({
      icon:   <Waves className="w-3.5 h-3.5 text-purple-400" />,
      label:  "STT — Deepgram Nova-2",
      detail: `${s.duration_mins} min × ₹${s.rate_per_min_inr}/min`,
      amount: s.cost_inr,
    });
  }
  if (breakdown.tts_sarvam) {
    const t = breakdown.tts_sarvam;
    rows.push({
      icon:   <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />,
      label:  "TTS — Sarvam Bulbul",
      detail: `${t.characters.toLocaleString()} chars × ₹${t.rate_per_1k_chars_inr}/1K`,
      amount: t.cost_inr,
    });
  }
  if (breakdown.llm) {
    const l = breakdown.llm;
    rows.push({
      icon:   <Cpu className="w-3.5 h-3.5 text-orange-400" />,
      label:  `LLM — ${l.provider}`,
      detail: `~${l.estimated_input_tokens.toLocaleString()} in + ${l.estimated_output_tokens.toLocaleString()} out tokens (est.)`,
      amount: l.cost_inr,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <IndianRupee className="w-3.5 h-3.5 text-primary" />
          Call Cost Breakdown
        </div>
        <span className="text-sm font-bold text-foreground">{fmt(total_inr)}</span>
      </div>

      <div className="divide-y divide-border/50">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="flex items-start gap-2 min-w-0">
              <span className="mt-0.5 shrink-0">{row.icon}</span>
              <div>
                <p className="text-xs font-medium text-foreground">{row.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{row.detail}</p>
              </div>
            </div>
            <span className="text-xs font-mono text-foreground shrink-0">{fmt(row.amount)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border">
        <span className="text-xs text-muted-foreground">Total (estimated)</span>
        <span className="text-xs font-bold text-primary">{fmt(total_inr)}</span>
      </div>

      <p className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-t border-border/50">
        LLM token counts are estimates. Pulse billing rounds up per started minute.
      </p>
    </div>
  );
}

// ── Call row ───────────────────────────────────────────────────────────────────

function CallRow({ call }: { call: VoiceCall }) {
  const [open, setOpen] = useState(false);
  const hasRecording = Boolean(call.recording_url);
  const hasCost      = Boolean(call.cost_breakdown?.total_inr);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4 text-primary" />
        </div>

        {/* Number + time */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm text-foreground">
              +91 {call.phone_number || "—"}
            </span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              STATUS_STYLES[call.status] || "bg-muted text-muted-foreground"
            )}>
              {call.status}
            </span>
            {hasRecording && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400">
                rec
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(call.created_at), "dd MMM yyyy, hh:mm a")}
          </p>
        </div>

        {/* Agent + duration + cost */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {call.agent_type === "gemini"
              ? <Brain className="w-3.5 h-3.5" />
              : <Mic   className="w-3.5 h-3.5" />}
            <span className="capitalize">{call.agent_type === "gemini" ? "Gemini" : "LiveKit"}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(call.duration_seconds)}</span>
          </div>
          {hasCost && (
            <div className="flex items-center gap-0.5 text-xs text-primary font-medium">
              <IndianRupee className="w-3 h-3" />
              <span>{call.cost_breakdown!.total_inr.toFixed(2)}</span>
            </div>
          )}
          <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground hidden sm:block">
            {call.voice_id}
          </span>
          {open
            ? <ChevronUp   className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">

          {/* Recording */}
          {hasRecording ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recording</p>
              <AudioPlayer url={call.recording_url!} />
            </div>
          ) : call.status === "completed" ? (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl">
              <Waves className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Recording not available — S3 egress may not be configured or the file is still processing.
              </p>
            </div>
          ) : null}

          {/* Transcript */}
          {call.transcript && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Transcript</p>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                {call.transcript}
              </div>
            </div>
          )}

          {/* Cost breakdown */}
          {call.cost_breakdown && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">API Cost Breakdown</p>
              <CostPanel cost={call.cost_breakdown} />
            </div>
          )}

          {/* Nothing available */}
          {!hasRecording && !call.transcript && !call.cost_breakdown && (
            <p className="text-xs text-muted-foreground italic">No recording, transcript, or cost data available yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CallHistoryPage() {
  const [calls,   setCalls]   = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);
  const LIMIT = 20;

  async function fetchCalls(p = 1) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/voice/calls?page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCalls(page); }, [page]);

  // Aggregate cost summary
  const totalSpend = calls.reduce((acc, c) => acc + (c.cost_breakdown?.total_inr ?? 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <PageShell size="medium">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Call History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} call{total !== 1 ? "s" : ""} total
            {totalSpend > 0 && (
              <span className="ml-2 text-primary font-medium">
                · ₹{totalSpend.toFixed(2)} this page
              </span>
            )}
          </p>
        </div>
        <a
          href="/dashboard/voice-agent"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Phone className="w-4 h-4" />
          New Call
        </a>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl skeleton" />
          ))}
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Phone className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold text-foreground">No calls yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Place your first AI voice call</p>
          <a href="/dashboard/voice-agent" className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            Go to Dialer
          </a>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {calls.map(call => <CallRow key={call.id} call={call} />)}
          </div>

          {total > LIMIT && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-xl border border-border text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(total / LIMIT)}
              </span>
              <button
                disabled={page * LIMIT >= total}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-xl border border-border text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
    </div>
  );
}
