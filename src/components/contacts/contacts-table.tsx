"use client";

import { useState } from "react";
import { Contact } from "@/types";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { Search, MessageSquare, Eye } from "lucide-react";
import Link from "next/link";
import { ContactSidebar } from "./contact-sidebar";

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts: initialContacts }: ContactsTableProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const handleContactUpdated = (updatedContact: Contact) => {
    setSelectedContact(updatedContact);
    setContacts((prev) =>
      prev.map((c) => (c.id === updatedContact.id ? updatedContact : c))
    );
  };

  const filtered = contacts.filter((c) => {
    const contactName = c.full_name ?? c.name ?? "";
    const contactPhone = c.phone ?? "";
    const contactEmail = c.email ?? "";
    return (
      contactName.toLowerCase().includes(search.toLowerCase()) ||
      contactPhone.includes(search) ||
      contactEmail.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-gray-500">{search ? "No contacts found" : "No contacts yet"}</p>
          <p className="text-xs text-gray-500/60 mt-1">Contacts are created when messages are sent or received</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-100/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden sm:table-cell">Email</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Messages</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide hidden md:table-cell">Last Active</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-100/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {getInitials(contact.full_name ?? contact.name, contact.phone)}
                        </span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {contact.full_name ?? contact.name ?? "Unknown"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{contact.phone}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{contact.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                      <MessageSquare className="w-3 h-3 text-gray-500" />
                      {contact.message_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {formatRelativeTime(contact.last_message_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setSelectedContact(contact)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 hover:text-primary transition-colors bg-gray-100/30 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg border border-border"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                      <Link
                        href="/dashboard/inbox"
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg border border-primary/20"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setSelectedContact(null)}
          />
          <div className="relative w-full max-w-[400px] h-full bg-white shadow-xl flex flex-col overflow-y-auto animate-in slide-in-from-right-full duration-200">
            <ContactSidebar
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
              onContactUpdated={handleContactUpdated}
            />
          </div>
        </div>
      )}
    </div>
  );
}
