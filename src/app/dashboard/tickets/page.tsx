"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { Ticket as TicketIcon, Loader2, Circle, ChevronRight, Plus, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { CustomSelect } from "@/components/ui";
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
    <div className="w-full px-8 pt-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <TicketIcon className="w-6 h-6 text-gray-900 shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">
              Support Tickets
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Conversations escalated from the AI chatbot or opened manually.
            </p>
          </div>
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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10B981] text-white rounded-lg text-sm font-medium hover:bg-[#10B981]/90 transition-colors"
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
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === f.key
                ? "bg-[#10B981]/10 text-[#10B981]"
                : "bg-gray-100/40 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <TicketIcon className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-900">No tickets here</p>
          <p className="text-xs text-gray-500 mt-1">
            Tickets appear when the AI escalates a chat or you create one manually.
          </p>
        </div>
      ) : (
        <div className="w-full">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[5rem_1fr_8rem_6rem_6rem_8rem_1.5rem] gap-4 px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-border/60">
            <span>Ref</span>
            <span>Subject</span>
            <span>Contact</span>
            <span>Severity</span>
            <span>Status</span>
            <span>Assignee</span>
            <span />
          </div>

          <div className="flex flex-col divide-y divide-border/40">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/dashboard/tickets/${t.id}`}
                className="flex md:grid md:grid-cols-[5rem_1fr_8rem_6rem_6rem_8rem_1.5rem] items-center gap-4 px-2 py-2.5 hover:bg-gray-100/20 transition-colors group"
              >
                <div className="shrink-0 text-xs font-mono text-gray-500">
                  TKT-{t.id.split("-")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{t.subject}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {formatRelativeTime(t.created_at)}
                    {(t.flags ?? []).slice(0, 2).map((f) => (
                      <span key={f} className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded border border-border text-gray-500">
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="hidden md:block text-xs text-gray-500 truncate">
                  {t.contact?.full_name ?? t.contact?.phone ?? "—"}
                </div>
                <div className="hidden md:block">
                  {SEVERITY_STYLE[t.severity].type === "active" ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-900 capitalize">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      {t.severity}
                    </div>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-gray-500 capitalize">
                      {t.severity}
                    </span>
                  )}
                </div>
                <div className="hidden md:block">
                  {STATUS_STYLE[t.status].type === "active" ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-900 capitalize">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      {t.status.replace(/_/g, " ")}
                    </div>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-gray-500 capitalize">
                      {t.status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="hidden md:block text-[11px] text-gray-500 truncate">
                  {t.assignee ? (t.assignee.full_name ?? t.assignee.email) : "Unassigned"}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-500/30 group-hover:text-gray-900 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {isNewTicketModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-card dark:bg-zinc-900 border border-border w-[460px] rounded-[12px] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Create Support Ticket</h2>
              <button 
                onClick={() => setIsNewTicketModalOpen(false)} 
                className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicketSubmit} className="space-y-4 text-sm">
              {/* Contact Search Field */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#10B981] bg-white text-gray-900"
                  />
                  {loadingContacts && (
                    <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-gray-500" />
                  )}
                  {/* Dropdown list */}
                  {contactsList.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-[6px] shadow-lg z-50 p-1 divide-y divide-border/40">
                      {contactsList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedContactId(c.id);
                            setContactSearchQuery(c.full_name || c.phone);
                            setContactsList([]);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-sm text-xs hover:bg-gray-50 transition-colors flex justify-between items-center ${
                            selectedContactId === c.id ? "bg-gray-50 font-semibold" : ""
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-gray-900 truncate max-w-[200px]">
                              {c.full_name || "Unknown Name"}
                            </p>
                            <p className="text-[10px] text-gray-500">{c.phone}</p>
                          </div>
                          {c.email && (
                            <span className="text-[10px] text-gray-500/80 truncate max-w-[120px]">
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
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Issue with payment verification"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#10B981] bg-white text-gray-900"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Provide details about the customer's request..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#10B981] bg-white text-gray-900 resize-none"
                />
              </div>

              {/* Severity */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Severity
                </label>
                <CustomSelect
                  value={ticketSeverity}
                  onValueChange={(val) => setTicketSeverity(val as TicketSeverity)}
                  options={[
                    { label: "Low", value: "low" },
                    { label: "Medium", value: "medium" },
                    { label: "High", value: "high" },
                    { label: "Critical", value: "critical" },
                  ]}
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-[6px] text-xs font-semibold hover:bg-gray-50 text-gray-500 bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-[#10B981] text-white rounded-[6px] text-xs font-semibold hover:bg-[#10B981]/90 transition-all shadow-sm flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
