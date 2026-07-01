"use client";

import { useEffect, useState, useRef } from "react";
import { Phone, Play, Pause, ChevronDown, ChevronUp, Clock, Mic, Brain, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PageShell } from "@/components/ui";

interface VoiceCall {
  id: string;
  to_number: string;
  agent_type: string;
  voice_id: string;
  status: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  initiated: "bg-primary/15 text-primary",
  ringing:   "bg-blue-500/15 text-blue-400",
  active:    "bg-emerald-500/15 text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-destructive/15 text-destructive",
};

function formatDuration(secs: number | null) {
  if (!secs) return "—";
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function AudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
      <audio ref={audioRef} src={url} onTimeUpdate={e => {
        const a = e.currentTarget;
        setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
      }} onEnded={() => setPlaying(false)} />
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
        {playing ? <Pause className="w-3.5 h-3.5 text-primary-foreground" /> : <Play className="w-3.5 h-3.5 text-primary-foreground ml-0.5" />}
      </button>
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <a href={url} download className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

function CallRow({ call }: { call: VoiceCall }) {
  const [open, setOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-sm text-foreground">+91 {call.to_number}</span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_STYLES[call.status] || "bg-muted text-muted-foreground")}>
              {call.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(call.created_at), "dd MMM yyyy, hh:mm a")}
          </p>
        </div>

        {/* Agent + duration */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {call.agent_type === "gemini" ? <Brain className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span className="capitalize">{call.agent_type === "gemini" ? "Gemini" : "LiveKit"}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatDuration(call.duration_seconds)}</span>
          </div>
          <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">{call.voice_id}</span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded: recording + transcript */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {call.recording_url && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recording</p>
              <AudioPlayer url={call.recording_url} />
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Transcript</p>
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3 whitespace-pre-wrap max-h-48 overflow-y-auto scrollbar-thin">
                {call.transcript}
              </div>
            </div>
          )}
          {!call.recording_url && !call.transcript && (
            <p className="text-xs text-muted-foreground italic">No recording or transcript available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  async function fetchCalls(p = 1) {
    setLoading(true);
    try {
      const res = await fetch(`/api/voice/calls?page=${p}&limit=${LIMIT}`);
      const data = await res.json();
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCalls(page); }, [page]);

  return (
    <PageShell size="medium">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Call History</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} calls total</p>
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

          {/* Pagination */}
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
  );
}
