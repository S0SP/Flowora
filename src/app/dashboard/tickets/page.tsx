"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ticket as TicketIcon, Loader2, Circle, ChevronRight, Plus, X } from "lucide-react";
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

  // New ticket modal states
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSeverity, setTicketSeverity] = useState<TicketSeverity>("medium");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [contactsList, setContactsList] = useState<{ id: string; full_name: string | null; phone: string; email: string | null }[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  // Debounced contact search
  useEffect(() => {
    if (!contactSearchQuery.trim()) {
      setContactsList([]);
      return;
    }
    // Don't search if it matches the selected contact name/phone
    const selected = contactsList.find(c => c.id === selectedContactId);
    if (selected && (selected.full_name === contactSearchQuery || selected.phone === contactSearchQuery)) {
      return;
    }

    const timer = setTimeout(() => {
      setLoadingContacts(true);
      fetch(`/api/contacts?limit=10&search=${encodeURIComponent(contactSearchQuery)}`)
        .then((r) => r.json())
        .then((d) => setContactsList(d.contacts ?? []))
        .catch(() => toast.error("Failed to search contacts"))
        .finally(() => setLoadingContacts(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [contactSearchQuery, selectedContactId]);

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId) {
      toast.error("Please select a contact");
      return;
    }
    if (!ticketSubject.trim()) {
      toast.error("Subject is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedContactId,
          subject: ticketSubject.trim(),
          description: ticketDescription.trim() || null,
          severity: ticketSeverity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create ticket");

      toast.success("Ticket created successfully");
      setIsNewTicketModalOpen(false);
      load(filter);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

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
        <button
          onClick={() => {
            setIsNewTicketModalOpen(true);
            setContactSearchQuery("");
            setContactsList([]);
            setSelectedContactId("");
            setTicketSubject("");
            setTicketDescription("");
            setTicketSeverity("medium");
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> New ticket
        </button>
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

      {/* New Ticket Modal */}
      {isNewTicketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border w-[460px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-foreground">Create Support Ticket</h2>
              <button 
                onClick={() => setIsNewTicketModalOpen(false)} 
                className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="space-y-4 text-sm">
              {/* Contact Search Field */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Contact (WhatsApp User) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search contact by name or number..."
                    value={contactSearchQuery}
                    onChange={(e) => {
                      setContactSearchQuery(e.target.value);
                      if (!e.target.value.trim()) setSelectedContactId("");
                    }}
                    className="w-full px-3 py-2 border border-input rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                  />
                  {loadingContacts && (
                    <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {/* Dropdown list */}
                  {contactsList.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-card border border-border rounded-xl shadow-lg z-50 p-1 divide-y divide-border/40">
                      {contactsList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedContactId(c.id);
                            setContactSearchQuery(c.full_name || c.phone);
                            setContactsList([]);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-muted transition-colors flex justify-between items-center ${
                            selectedContactId === c.id ? "bg-muted font-semibold" : ""
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-foreground truncate max-w-[200px]">
                              {c.full_name || "Unknown Name"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{c.phone}</p>
                          </div>
                          {c.email && (
                            <span className="text-[10px] text-muted-foreground/80 truncate max-w-[120px]">
                              {c.email}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedContactId && (
                  <p className="text-[10px] text-emerald-600 mt-1 font-medium">✓ Contact selected</p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Issue with payment verification"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Provide details about the customer's request..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground resize-none"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Severity
                </label>
                <select
                  value={ticketSeverity}
                  onChange={(e) => setTicketSeverity(e.target.value as TicketSeverity)}
                  className="w-full px-3 py-2 border border-input rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-muted text-muted-foreground bg-card"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
