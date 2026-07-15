"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ticket as TicketIcon, Loader2, Circle, ChevronRight, Plus } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { TicketSeverity, TicketStatus } from "@/services/tickets";

type TicketRow = {
  id: string;
  ref: number;
  subject: string;
  status: TicketStatus;
  severity: TicketSeverity;
  flags: string[];
  source: string;
  created_at: string;
  contact?: { id: string; full_name: string | null; phone: string } | null;
  assignee?: { full_name: string | null; email: string } | null;
};

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

const FILTERS = [
  { key: "all",       label: "All open",         params: "" },
  { key: "new",       label: "New / unassigned",  params: "assignee=unassigned" },
  { key: "mine",      label: "Assigned to me",    params: "assignee=me" },
  { key: "tagged",    label: "Tagged to me",      params: "tagged=me" },
  { key: "escalated", label: "Escalated",         params: "status=escalated" },
  { key: "resolved",  label: "Resolved",          params: "status=resolved" },
];

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback((f: string) => {
    setLoading(true);
    const params = FILTERS.find((x) => x.key === f)?.params ?? "";
    fetch(`/api/tickets?${params}`)
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []))
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <TicketIcon className="w-6 h-6" /> Support Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversations escalated from the AI chatbot or opened manually.
          </p>
        </div>
        <Link
          href="/dashboard/contacts"
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New ticket
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <TicketIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No tickets here</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tickets appear when the AI escalates a chat or you create one manually.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border/60">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[5rem_1fr_8rem_6rem_6rem_8rem_1.5rem] gap-4 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Ref</span>
            <span>Subject</span>
            <span>Contact</span>
            <span>Severity</span>
            <span>Status</span>
            <span>Assignee</span>
            <span />
          </div>

          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/tickets/${t.id}`}
              className="flex md:grid md:grid-cols-[5rem_1fr_8rem_6rem_6rem_8rem_1.5rem] items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors group"
            >
              <div className="shrink-0 text-xs font-mono text-muted-foreground">
                TKT-{t.id.split("-")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {formatRelativeTime(t.created_at)}
                  {(t.flags ?? []).slice(0, 2).map((f) => (
                    <span key={f} className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
                </p>
              </div>
              <div className="hidden md:block text-xs text-muted-foreground truncate">
                {t.contact?.full_name ?? t.contact?.phone ?? "—"}
              </div>
              <div className="hidden md:block">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${SEVERITY_COLOR[t.severity]}`}>
                  {t.severity}
                </span>
              </div>
              <div className="hidden md:block">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status]}`}>
                  {t.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="hidden md:block text-xs text-muted-foreground truncate">
                {t.assignee ? (t.assignee.full_name ?? t.assignee.email) : "Unassigned"}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
