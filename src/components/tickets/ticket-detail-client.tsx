"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Loader2, User, Bot, Headset,
  ShieldAlert, CheckCircle2, AlertTriangle, UserPlus,
  MessageSquare, StickyNote, ChevronDown,
} from "lucide-react";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";
import type { TicketStatus, TicketSeverity } from "@/services/tickets";

// ── Types ─────────────────────────────────────────────────────────────────────

type Agent = { id: string; user_id: string; full_name: string | null; email: string; role: string };
type Contact = { id: string; full_name: string | null; phone: string; email: string | null };
type Message = {
  id: string; content: string | null; type: string; sender_type: string;
  sender_id: string | null; status: string; created_at: string;
  file_url?: string | null; metadata?: Record<string, any>;
};
type TicketEvent = {
  id: string; event_type: string; from_value: string | null; to_value: string | null;
  note: string | null; actor_id: string | null; created_at: string;
  actor?: { full_name: string | null; email: string } | null;
};
type TicketTag = {
  id: string; tagged_user_id: string; tagged_by: string | null; reason: string | null; is_read: boolean;
  created_at: string;
  tagged?: { full_name: string | null; email: string } | null;
};
type Ticket = {
  id: string; ref: number; subject: string; status: TicketStatus; severity: TicketSeverity;
  flags: string[]; source: string; escalation_reason: string | null; description: string | null;
  assigned_to: string | null; created_by: string | null; created_at: string;
  thread_id: string | null; contact_id: string;
  contact?: Contact | null;
  assignee?: { full_name: string | null; email: string } | null;
  thread?: { id: string; ai_active: boolean } | null;
};
type Bundle = {
  ticket: Ticket;
  messages: Message[];
  events: TicketEvent[];
  tags: TicketTag[];
  agents: Agent[];
};

// ── Status / severity colours ─────────────────────────────────────────────────

const STATUS_COLOR: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-blue-100 text-blue-700",
  escalated: "bg-red-100 text-red-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-500",
};
const SEVERITY_COLOR: Record<TicketSeverity, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-blue-100 text-blue-600",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

// ── Main component ────────────────────────────────────────────────────────────

export function TicketDetailClient({
  ticketId,
  currentUserId,
}: {
  ticketId: string;
  currentUserId: string;
}) {
  const [supabase] = useState(() => createClient());
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"chat" | "activity">("chat");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch(`/api/tickets/${ticketId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => toast.error(e.message || "Failed to load ticket"))
      .finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(load, [load]);

  // Realtime: new messages for the linked thread
  useEffect(() => {
    if (!data?.ticket.thread_id) return;
    const channel = supabase
      .channel(`ticket-msgs:${data.ticket.thread_id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${data.ticket.thread_id}`,
      }, (payload) => {
        setData((prev) =>
          prev ? { ...prev, messages: [...prev.messages, payload.new as Message] } : prev
        );
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [data?.ticket.thread_id, supabase]);

  // Realtime Presence — show other agents viewing this ticket
  useEffect(() => {
    if (!data) return;
    const me = data.agents.find((a) => a.user_id === currentUserId);
    const myName = me?.full_name ?? me?.email ?? "Unknown Agent";

    const room = supabase.channel(`ticket_presence:${ticketId}`, {
      config: { presence: { key: currentUserId } },
    });

    room.on("presence", { event: "sync" }, () => {
      const state = room.presenceState();
      const active = Object.values(state)
        .flatMap((s: any) => s)
        .map((v) => ({ id: String(v.user_id), name: String(v.name) }));
      const unique = Array.from(new Map(active.map((i) => [i.id, i])).values());
      setViewers(unique.filter((v) => v.id !== currentUserId));
    });

    room.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await room.track({ user_id: currentUserId, name: myName, online_at: new Date().toISOString() });
      }
    });

    return () => { supabase.removeChannel(room); };
  }, [data?.agents, ticketId, currentUserId, supabase]);

  useEffect(() => {
    if (tab === "chat") setTimeout(() => endRef.current?.scrollIntoView(), 100);
  }, [data?.messages.length, tab]);

  const act = async (url: string, body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Action failed");
      toast.success(successMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const text = reply.trim();
    setReply("");
    await act(`/api/tickets/${ticketId}/reply`, { message: text }, "Reply sent");
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const text = note.trim();
    setNote("");
    await act(`/api/tickets/${ticketId}/notes`, { note: text }, "Note added");
  };

  const patch = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success(successMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-32 text-sm text-muted-foreground">Ticket not found.</div>
    );
  }

  const { ticket } = data;
  const isClosed = ticket.status === "resolved" || ticket.status === "closed";
  const contactName = ticket.contact?.full_name || ticket.contact?.phone || "Unknown";

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/tickets"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              TKT-{ticket.id.split("-")[0].toUpperCase()}
            </span>
            <h1 className="text-base font-bold text-foreground truncate">{ticket.subject}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {contactName} · opened {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${SEVERITY_COLOR[ticket.severity]}`}>
          {ticket.severity}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[ticket.status]}`}>
          {ticket.status.replace(/_/g, " ")}
        </span>

        {viewers.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {viewers.map((v) => v.name).join(", ")}{" "}
              {viewers.length === 1 ? "is" : "are"} also viewing
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* ── Left: chat / activity ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl flex flex-col h-[calc(100vh-13rem)] overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setTab("chat")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                tab === "chat"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="w-4 h-4" /> Conversation
            </button>
            <button
              onClick={() => setTab("activity")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                tab === "activity"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <StickyNote className="w-4 h-4" /> Activity & notes
            </button>
          </div>

          {tab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {data.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No messages yet.
                  </p>
                ) : (
                  data.messages.map((m) => <MessageBubble key={m.id} m={m} />)
                )}
                <div ref={endRef} />
              </div>
              <div className="p-3 border-t border-border shrink-0">
                {isClosed ? (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    This ticket is {ticket.status}. Reopen it to reply.
                  </p>
                ) : !ticket.thread_id ? (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    No linked conversation thread. Use the Inbox to reply.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply();
                        }
                      }}
                      placeholder="Reply to customer on WhatsApp… (Enter to send)"
                      rows={1}
                      className="flex-1 px-3 py-2.5 bg-background border border-input rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
                      style={{ minHeight: "40px" }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={busy || !reply.trim()}
                      className="w-10 h-10 flex items-center justify-center bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all disabled:opacity-50 shrink-0"
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {data.events.map((e) => <EventRow key={e.id} e={e} />)}
                {data.events.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    No activity yet.
                  </p>
                )}
              </div>
              <div className="p-3 border-t border-border shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note (not sent to customer)…"
                    rows={1}
                    className="flex-1 px-3 py-2.5 bg-background border border-input rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
                    style={{ minHeight: "40px" }}
                  />
                  <button
                    onClick={addNote}
                    disabled={busy || !note.trim()}
                    className="h-10 px-3 flex items-center gap-1.5 bg-muted hover:bg-muted/70 text-foreground rounded-xl transition-all disabled:opacity-50 shrink-0 text-sm font-medium"
                  >
                    <StickyNote className="w-4 h-4" /> Note
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Right: controls ────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Customer card */}
          <Panel title="Customer">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {getInitials(ticket.contact?.full_name ?? null, ticket.contact?.phone ?? "")}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{contactName}</p>
                <p className="text-xs text-muted-foreground truncate">{ticket.contact?.phone}</p>
              </div>
            </div>
            {ticket.description && (
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                {ticket.description}
              </p>
            )}
            {ticket.escalation_reason && (
              <p className="mt-2 text-xs text-amber-600 flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {ticket.escalation_reason}
              </p>
            )}
          </Panel>

          {/* Manage panel */}
          <Panel title="Manage">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Assignee
            </label>
            <SelectBox
              value={ticket.assigned_to ?? ""}
              onChange={(v) => patch({ assigned_to: v }, "Ticket assigned")}
              disabled={busy}
              options={[
                { value: "", label: "Unassigned", disabled: true },
                ...data.agents.map((a) => ({
                  value: a.user_id,
                  label:
                    (a.full_name || a.email) + (a.user_id === currentUserId ? " (me)" : ""),
                })),
              ]}
            />
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3 block">
              Status
            </label>
            <SelectBox
              value={ticket.status}
              onChange={(v) => patch({ status: v }, "Status updated")}
              disabled={busy}
              options={(
                ["open", "assigned", "in_progress", "escalated", "resolved", "closed"] as TicketStatus[]
              ).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
            />
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mt-3 block">
              Severity
            </label>
            <SelectBox
              value={ticket.severity}
              onChange={(v) => patch({ severity: v }, "Severity updated")}
              disabled={busy}
              options={(["low", "medium", "high", "critical"] as TicketSeverity[]).map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </Panel>

          {/* Actions */}
          <Panel title="Actions">
            <div className="grid grid-cols-2 gap-2">
              {!isClosed ? (
                <>
                  <ActionBtn
                    icon={CheckCircle2}
                    label="Resolve"
                    onClick={() =>
                      act(
                        `/api/tickets/${ticketId}/resolve`,
                        { action: "resolve" },
                        "Ticket resolved — AI resumed"
                      )
                    }
                    disabled={busy}
                    primary
                  />
                  <ActionBtn
                    icon={CheckCircle2}
                    label="Close"
                    onClick={() =>
                      act(
                        `/api/tickets/${ticketId}/resolve`,
                        { action: "close" },
                        "Ticket closed — AI resumed"
                      )
                    }
                    disabled={busy}
                  />
                  <ActionBtn
                    icon={ShieldAlert}
                    label="Escalate"
                    onClick={() => {
                      const r = window.prompt("Reason for escalation:");
                      if (r !== null)
                        act(
                          `/api/tickets/${ticketId}/escalate`,
                          { reason: r },
                          "Escalated for admin review"
                        );
                    }}
                    disabled={busy}
                  />
                  <TagButton
                    agents={data.agents}
                    currentUserId={currentUserId}
                    onTag={(uid, reason) =>
                      act(
                        `/api/tickets/${ticketId}/tag`,
                        { user_id: uid, reason },
                        "Colleague tagged"
                      )
                    }
                    disabled={busy}
                  />
                </>
              ) : (
                <ActionBtn
                  icon={AlertTriangle}
                  label="Reopen"
                  onClick={() =>
                    act(
                      `/api/tickets/${ticketId}/resolve`,
                      { action: "reopen" },
                      "Ticket reopened"
                    )
                  }
                  disabled={busy}
                  primary
                  className="col-span-2"
                />
              )}
            </div>
          </Panel>

          {/* Review tags */}
          {data.tags.length > 0 && (
            <Panel title="Review tags">
              <div className="space-y-1.5">
                {data.tags.map((t) => {
                  const tagger = data.agents.find((a) => a.user_id === t.tagged_by);
                  const taggerName = tagger ? tagger.full_name || tagger.email : "System";
                  return (
                    <div key={t.id} className="text-xs flex items-center gap-2">
                      <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-foreground font-medium">
                        {t.tagged?.full_name || t.tagged?.email}
                      </span>
                      <span className="text-muted-foreground">
                        tagged by{" "}
                        <span className="text-foreground/80 font-medium">{taggerName}</span>
                      </span>
                      {t.reason && (
                        <span className="text-muted-foreground truncate">— {t.reason}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ m }: { m: Message }) {
  const outbound = m.sender_type === "agent" || m.sender_type === "bot" || m.sender_type === "system";
  const senderMeta: Record<string, { icon: typeof Bot; label: string }> = {
    bot: { icon: Bot, label: "AI" },
    agent: { icon: Headset, label: "Agent" },
    system: { icon: Bot, label: "System" },
    contact: { icon: User, label: "Customer" },
  };
  const meta = senderMeta[m.sender_type] ?? senderMeta.contact;
  const Icon = meta.icon;

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className="max-w-[75%]">
        <div
          className={cn(
            "flex items-center gap-1 mb-0.5 text-[10px] text-muted-foreground",
            outbound ? "justify-end" : "justify-start"
          )}
        >
          <Icon className="w-3 h-3" /> {meta.label}
        </div>
        <div
          className={cn(
            "px-3.5 py-2.5 rounded-2xl text-sm",
            outbound
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <p
            className={cn(
              "text-[10px] mt-1",
              outbound ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
            )}
          >
            {new Date(m.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

function EventRow({
  e,
}: {
  e: TicketEvent;
}) {
  const who = e.actor ? e.actor.full_name || e.actor.email : "AI / system";
  if (e.event_type === "commented") {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground flex items-center gap-1">
            <StickyNote className="w-3 h-3" /> {who}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(e.created_at)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{e.note}</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
      <span className="text-foreground/80 font-medium">{who}</span>
      <span>
        {e.event_type.replace(/_/g, " ")}
        {e.to_value ? `: ${e.to_value}` : ""}
      </span>
      <span className="ml-auto text-[10px]">{formatRelativeTime(e.created_at)}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none px-3 py-2 pr-8 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 capitalize"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  primary,
  className,
}: {
  icon: typeof CheckCircle2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-muted text-foreground hover:bg-muted/70",
        className
      )}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function TagButton({
  agents,
  currentUserId,
  onTag,
  disabled,
}: {
  agents: Agent[];
  currentUserId: string;
  onTag: (uid: string, reason: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative col-span-1">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-muted text-foreground hover:bg-muted/70 transition-all disabled:opacity-50"
      >
        <UserPlus className="w-3.5 h-3.5" /> Tag
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-52 bg-card border border-border rounded-xl shadow-xl z-20 p-1 max-h-64 overflow-y-auto">
          {agents
            .filter((a) => a.user_id !== currentUserId)
            .map((a) => (
              <button
                key={a.user_id}
                onClick={() => {
                  const r = window.prompt(`Tag ${a.full_name || a.email} — reason (optional):`) ?? "";
                  setOpen(false);
                  onTag(a.user_id, r);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors truncate"
              >
                {a.full_name || a.email}
              </button>
            ))}
          {agents.filter((a) => a.user_id !== currentUserId).length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">No colleagues yet</p>
          )}
        </div>
      )}
    </div>
  );
}
