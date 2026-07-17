"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import * as Select from "@radix-ui/react-select";
import {
  ArrowLeft, Send, Loader2, User, Bot, Headset,
  ShieldAlert, CheckCircle2, AlertTriangle, UserPlus,
  MessageSquare, StickyNote, ChevronDown, Check, PanelRight,
} from "lucide-react";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";
import type { TicketStatus, TicketSeverity } from "@/services/tickets";
import { ContactSidebar } from "@/components/contacts/contact-sidebar";

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

const STATUS_STYLE: Record<TicketStatus, { type: "neutral" | "active" }> = {
  open: { type: "active" },
  assigned: { type: "active" },
  in_progress: { type: "active" },
  escalated: { type: "active" },
  resolved: { type: "neutral" },
  closed: { type: "neutral" },
};
const SEVERITY_STYLE: Record<TicketSeverity, { type: "neutral" | "active" }> = {
  low: { type: "neutral" },
  medium: { type: "neutral" },
  high: { type: "active" },
  critical: { type: "active" },
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
  const [isPanelOpen, setIsPanelOpen] = useState(false);
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-center py-32 text-sm text-gray-500">Ticket not found.</div>
    );
  }

  const { ticket } = data;
  const isClosed = ticket.status === "resolved" || ticket.status === "closed";
  const contactName = ticket.contact?.full_name || ticket.contact?.phone || "Unknown";

  return (
    <div className="flex flex-col h-full w-full bg-white overflow-hidden text-gray-900">
      <div className="flex flex-1 overflow-hidden w-full bg-white relative">
        {/* Left Column (Chat Pane) */}
        <div className="flex flex-1 flex-col overflow-hidden relative border-r border-border min-w-0">
          
          {/* Header */}
          <div className="flex items-center gap-3 pt-8 px-6 pb-4 shrink-0">
            <Link
              href="/dashboard/tickets"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-all shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500 shrink-0">
                  TKT-{ticket.id.split("-")[0].toUpperCase()}
                </span>
                <h1 className="text-base font-bold text-gray-900 truncate">{ticket.subject}</h1>
              </div>
              <p className="text-xs text-gray-500 truncate">
                {contactName} · opened {formatRelativeTime(ticket.created_at)}
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {SEVERITY_STYLE[ticket.severity].type === "active" ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-900 capitalize">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  {ticket.severity}
                </div>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-gray-500 capitalize">
                  {ticket.severity}
                </span>
              )}

              <div className="w-px h-4 bg-border mx-1" />

              {STATUS_STYLE[ticket.status].type === "active" ? (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-900 capitalize">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  {ticket.status.replace(/_/g, " ")}
                </div>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-gray-500 capitalize">
                  {ticket.status.replace(/_/g, " ")}
                </span>
              )}

              {/* Mobile toggle for Right Panel */}
              <button
                onClick={() => setIsPanelOpen(true)}
                className="lg:hidden ml-2 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-500 transition-all"
              >
                <PanelRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 px-6 border-b border-border shrink-0">
            <button
              onClick={() => setTab("chat")}
              className={cn(
                "pb-3 text-sm font-medium transition-colors flex items-center gap-2",
                tab === "chat"
                  ? "text-gray-900 border-b-2 border-primary"
                  : "text-gray-500/60 hover:text-gray-900"
              )}
            >
              <MessageSquare className="w-4 h-4" /> Conversation
            </button>
            <button
              onClick={() => setTab("activity")}
              className={cn(
                "pb-3 text-sm font-medium transition-colors flex items-center gap-2",
                tab === "activity"
                  ? "text-gray-900 border-b-2 border-primary"
                  : "text-gray-500/60 hover:text-gray-900"
              )}
            >
              <StickyNote className="w-4 h-4" /> Activity & notes
            </button>
          </div>

          {/* Body */}
          {tab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {data.messages.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-8">
                    No messages yet.
                  </p>
                ) : (
                  data.messages.map((m, i, arr) => (
                    <MessageBubble 
                      key={m.id} 
                      m={m} 
                      isConsecutive={i > 0 && arr[i-1].sender_type === m.sender_type} 
                    />
                  ))
                )}
                <div ref={endRef} />
              </div>
              <div className="px-6 py-4 border-t border-border shrink-0">
                {isClosed ? (
                  <p className="text-xs text-center text-gray-500 py-2">
                    This ticket is {ticket.status}. Reopen it to reply.
                  </p>
                ) : !ticket.thread_id ? (
                  <p className="text-xs text-center text-gray-500 py-2">
                    No linked conversation thread. Use the Inbox to reply.
                  </p>
                ) : (
                  <div className="relative flex items-end">
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
                      className="w-full pl-4 pr-12 py-3 bg-transparent border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring max-h-32"
                      style={{ minHeight: "44px" }}
                    />
                    <button
                      onClick={sendReply}
                      disabled={busy || !reply.trim()}
                      className="absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-[#10B981] transition-colors disabled:opacity-50"
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
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {data.events.map((e) => <EventRow key={e.id} e={e} />)}
                {data.events.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-8">
                    No activity yet.
                  </p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border shrink-0">
                <div className="relative flex items-end">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add an internal note (not sent to customer)…"
                    rows={1}
                    className="w-full pl-4 pr-24 py-3 bg-transparent border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring max-h-32 bg-amber-50/30"
                    style={{ minHeight: "44px" }}
                  />
                  <button
                    onClick={addNote}
                    disabled={busy || !note.trim()}
                    className="absolute right-2 bottom-2 h-8 px-3 flex items-center gap-1.5 text-gray-500 hover:text-amber-600 transition-colors disabled:opacity-50 text-xs font-semibold"
                  >
                    <StickyNote className="w-3.5 h-3.5" /> Note
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Panel (Desktop) */}
        <div className="hidden lg:flex w-[320px] flex-shrink-0 flex-col h-full overflow-y-auto bg-white border-l border-border">
          <RightPanelContent
            ticket={ticket}
            data={data}
            contactName={contactName}
            currentUserId={currentUserId}
            busy={busy}
            patch={patch}
            act={act}
            ticketId={ticketId}
            isClosed={isClosed}
          />
        </div>

        {/* Right Panel (Mobile Overlay) */}
        {isPanelOpen && (
          <div className="absolute inset-0 z-50 lg:hidden flex justify-end bg-black/20 backdrop-blur-sm">
            <div
              className="absolute inset-0"
              onClick={() => setIsPanelOpen(false)}
            />
            <div className="relative w-full max-w-[320px] h-full bg-white shadow-xl flex flex-col overflow-y-auto animate-in slide-in-from-right-full duration-200">
              <RightPanelContent
                ticket={ticket}
                data={data}
                contactName={contactName}
                currentUserId={currentUserId}
                busy={busy}
                patch={patch}
                act={act}
                ticketId={ticketId}
                isClosed={isClosed}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MessageBubble({ m, isConsecutive }: { m: Message; isConsecutive?: boolean }) {
  const isSystem = m.sender_type === "system";
  
  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1 text-[10px] text-gray-500 flex items-center gap-1.5 shadow-sm border border-border">
          <Bot className="w-3 h-3" />
          <span className="font-medium whitespace-pre-wrap">{m.content}</span>
          <span className="opacity-70 ml-1">
            {new Date(m.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    );
  }

  const outbound = m.sender_type === "agent" || m.sender_type === "bot";
  const senderMeta: Record<string, { icon: typeof Bot; label: string }> = {
    bot: { icon: Bot, label: "AI" },
    agent: { icon: Headset, label: "Agent" },
    contact: { icon: User, label: "Customer" },
  };
  const meta = senderMeta[m.sender_type] ?? senderMeta.contact;
  const Icon = meta.icon;

  return (
    <div className={cn("flex w-full", outbound ? "justify-end" : "justify-start", isConsecutive ? "mt-1" : "mt-4")}>
      <div className="max-w-[70%]">
        {!isConsecutive && (
          <div
            className={cn(
              "flex items-center gap-1 mb-1 text-[10px] text-gray-500 font-medium",
              outbound ? "justify-end" : "justify-start"
            )}
          >
            <Icon className="w-3 h-3" /> {meta.label}
          </div>
        )}
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
            outbound
              ? "bg-[#10B981] text-white rounded-br-sm"
              : "bg-gray-100 text-gray-900 rounded-bl-sm border border-border/50",
            isConsecutive && outbound && "rounded-tr-sm",
            isConsecutive && !outbound && "rounded-tl-sm"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <div
            className={cn(
              "text-[10px] mt-1.5 flex items-center gap-1 font-medium tracking-tight",
              outbound ? "text-white/70 justify-end" : "text-gray-500 justify-start"
            )}
          >
            {new Date(m.created_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
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
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
          <StickyNote className="w-3 h-3 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0 bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              {who}
            </span>
            <span className="text-[10px] text-amber-700 shrink-0 ml-auto">
              {formatRelativeTime(e.created_at)}
            </span>
          </div>
          <p className="text-xs text-amber-900 whitespace-pre-wrap">{e.note}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-gray-100/40 flex items-center justify-center shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-border" />
      </div>
      <div className="flex-1 min-w-0 flex items-center text-xs text-gray-500">
        <span className="text-gray-900 font-medium mr-1">{who}</span>
        <span>
          {e.event_type.replace(/_/g, " ")}
          {e.to_value ? `: ${e.to_value}` : ""}
        </span>
        <span className="ml-auto text-[10px] shrink-0 pl-2">{formatRelativeTime(e.created_at)}</span>
      </div>
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
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger className="flex items-center justify-between w-full px-3 py-1.5 bg-transparent border border-border rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 capitalize hover:bg-gray-100/30 transition-colors data-[placeholder]:text-gray-500 h-8">
        <Select.Value />
        <Select.Icon>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={4} className="overflow-hidden bg-white border border-border rounded-xl shadow-lg z-50 animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 min-w-[var(--radix-select-trigger-width)]">
          <Select.Viewport className="p-1 h-[var(--radix-select-content-available-height)] w-full">
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex items-center justify-between px-2.5 py-2 text-xs rounded-lg cursor-default select-none outline-none data-[disabled]:opacity-50 data-[disabled]:pointer-events-none capitalize text-gray-900 hover:bg-[#F3F4F6] transition-colors group"
              >
                <Select.ItemText className="group-data-[state=checked]:font-semibold">{o.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
          ? "bg-[#10B981] text-white hover:bg-[#10B981]/90"
          : "bg-card border border-border text-gray-900 hover:bg-gray-100",
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
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-card border border-border text-gray-900 hover:bg-gray-100 transition-all disabled:opacity-50"
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
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-gray-100 transition-colors truncate"
              >
                {a.full_name || a.email}
              </button>
            ))}
          {agents.filter((a) => a.user_id !== currentUserId).length === 0 && (
            <p className="px-2.5 py-2 text-xs text-gray-500">No colleagues yet</p>
          )}
        </div>
      )}
    </div>
  );
}

function RightPanelContent({
  ticket,
  data,
  contactName,
  currentUserId,
  busy,
  patch,
  act,
  ticketId,
  isClosed,
}: any) {
  return (
    <>
      {/* Customer section */}
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Customer
        </p>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-primary">
              {getInitials(ticket.contact?.full_name ?? null, ticket.contact?.phone ?? "")}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
            <p className="text-xs text-gray-500 truncate">{ticket.contact?.phone}</p>
          </div>
        </div>
        {ticket.description && (
          <p className="mt-3 text-xs text-gray-500 leading-relaxed border-t border-border pt-3">
            {ticket.description}
          </p>
        )}
        {ticket.escalation_reason && (
          <p className="mt-2 text-xs text-amber-600 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {ticket.escalation_reason}
          </p>
        )}
      </div>

      {ticket.contact && (
        <div className="border-t border-border w-full">
          <ContactSidebar contact={ticket.contact as any} hideHeader />
        </div>
      )}

      <div className="border-t border-border w-full" />

      {/* Manage section */}
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Manage
        </p>
        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Assignee
        </label>
        <SelectBox
          value={ticket.assigned_to ?? "unassigned"}
          onChange={(v: string) => patch({ assigned_to: v === "unassigned" ? null : v }, "Ticket assigned")}
          disabled={busy}
          options={[
            { value: "unassigned", label: "Unassigned", disabled: true },
            ...data.agents.map((a: any) => ({
              value: a.user_id,
              label:
                (a.full_name || a.email) + (a.user_id === currentUserId ? " (me)" : ""),
            })),
          ]}
        />
        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-3 block">
          Status
        </label>
        <SelectBox
          value={ticket.status}
          onChange={(v: string) => patch({ status: v }, "Status updated")}
          disabled={busy}
          options={(
            ["open", "assigned", "in_progress", "escalated", "resolved", "closed"] as TicketStatus[]
          ).map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
        />
        <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-3 block">
          Severity
        </label>
        <SelectBox
          value={ticket.severity}
          onChange={(v: string) => patch({ severity: v }, "Severity updated")}
          disabled={busy}
          options={(["low", "medium", "high", "critical"] as TicketSeverity[]).map((s) => ({
            value: s,
            label: s,
          }))}
        />
      </div>

      <div className="border-t border-border w-full" />

      {/* Actions section */}
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Actions
        </p>
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
                onTag={(uid: string, reason: string) =>
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
      </div>

      {/* Review tags */}
      {data.tags.length > 0 && (
        <>
          <div className="border-t border-border w-full" />
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Review tags
            </p>
            <div className="space-y-2">
              {data.tags.map((t: any) => {
                const tagger = data.agents.find((a: any) => a.user_id === t.tagged_by);
                const taggerName = tagger ? tagger.full_name || tagger.email : "System";
                return (
                  <div key={t.id} className="text-xs flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <span className="text-gray-900 font-medium">
                        {t.tagged?.full_name || t.tagged?.email}
                      </span>
                    </div>
                    <span className="text-gray-500 pl-5">
                      tagged by <span className="text-gray-900/80 font-medium">{taggerName}</span>
                    </span>
                    {t.reason && (
                      <span className="text-gray-500 pl-5 break-words">— {t.reason}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
