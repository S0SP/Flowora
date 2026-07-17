"use client"

import React, { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { 
  Upload, Plus, Users, MessageCircle, Search, SlidersHorizontal, 
  MoreHorizontal, X, MessageSquare, Phone, Mail, Ticket, Loader2,
  Trash2, Tag, Check, Edit2, AlertCircle, Sparkles, Filter, ChevronDown
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import { toast } from "sonner"
import { Input } from "@/components/atoms/Input"
import { Badge } from "@/components/atoms/Badge"
import { CustomSelect } from "@/components/ui"
import { createPortal } from "react-dom"
import { Avatar, AvatarFallback } from "@/components/atoms/Avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, formatRelativeTime } from "@/lib/utils"
import Papa from "papaparse"
import { ContactSidebar } from "@/components/contacts/contact-sidebar"

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: string
  tags: string[]
  custom_fields?: Record<string, any>
  lastContact: string
}

export default function ContactsPage() {
  const queryClient = useQueryClient()
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("All Contacts")
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])
  
  // Modals state
  const [isAddContactOpen, setIsAddContactOpen] = useState(false)
  const [isImportCsvOpen, setIsImportCsvOpen] = useState(false)
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false)
  
  // Drawer edit state
  const [isEditingInDrawer, setIsEditingInDrawer] = useState(false)
  const [drawerEditName, setDrawerEditName] = useState("")
  const [drawerEditEmail, setDrawerEditEmail] = useState("")
  const [drawerEditCompany, setDrawerEditCompany] = useState("")
  const [drawerEditStatus, setDrawerEditStatus] = useState("Lead")
  const [newTagInput, setNewTagInput] = useState("")

  // Add Contact Form State
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    status: "Lead",
    tags: ""
  })

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvTextData, setCsvTextData] = useState("")
  const [isImporting, setIsImporting] = useState(false)

  // Bulk Actions tag input
  const [bulkTags, setBulkTags] = useState("")

  // Ticket creation states
  const [ticketSubject, setTicketSubject] = useState("")
  const [ticketDescription, setTicketDescription] = useState("")
  const [ticketSeverity, setTicketSeverity] = useState("medium")
  const [submittingTicket, setSubmittingTicket] = useState(false)

  // Fetch contacts
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      return (data.contacts ?? []).map((c: any) => ({
        id: c.id,
        name: c.full_name || c.name || "Unknown",
        email: c.email || "—",
        phone: c.phone || "—",
        company: c.company || "—",
        status: c.status || "Lead",
        tags: c.tags || [],
        custom_fields: c.custom_fields || {},
        lastContact: c.last_message_at ? formatRelativeTime(c.last_message_at) : "—",
      }))
    },
  })

  // Mutations
  const addContactMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to save contact")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success("Contact added successfully")
      setIsAddContactOpen(false)
      setAddForm({ name: "", phone: "", email: "", company: "", status: "Lead", tags: "" })
    },
    onError: (err: any) => {
      toast.error(err.message)
    }
  })

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to update contact")
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      if (selectedContact && selectedContact.id === data.contact.id) {
        setSelectedContact({
          ...selectedContact,
          name: data.contact.full_name || data.contact.name || "Unknown",
          email: data.contact.email || "—",
          company: data.contact.company || "—",
          status: data.contact.status || "Lead",
          tags: data.contact.tags || [],
          custom_fields: data.contact.custom_fields || {}
        })
      }
      toast.success("Contact updated successfully")
      setIsEditingInDrawer(false)
    },
    onError: (err: any) => {
      toast.error(err.message)
    }
  })

  const deleteContactsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Failed to delete contacts")
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success("Contacts deleted successfully")
      setSelectedContactIds([])
      if (selectedContact && selectedContactIds.includes(selectedContact.id)) {
        setSelectedContact(null)
      }
    },
    onError: (err: any) => {
      toast.error(err.message)
    }
  })

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await Promise.all(
        ids.map(id =>
          fetch("/api/contacts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status })
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success("Bulk status updated successfully")
      setSelectedContactIds([])
    }
  })

  const bulkAddTagsMutation = useMutation({
    mutationFn: async ({ ids, newTags }: { ids: string[]; newTags: string[] }) => {
      await Promise.all(
        ids.map(id => {
          const contact = contacts.find(c => c.id === id)
          const existing = contact ? contact.tags : []
          const combined = Array.from(new Set([...existing, ...newTags]))
          return fetch("/api/contacts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, tags: combined })
          })
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] })
      toast.success("Tags appended successfully")
      setSelectedContactIds([])
      setIsBulkTagOpen(false)
      setBulkTags("")
    }
  })

  // Ticket Submission
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedContact) return
    if (!ticketSubject.trim()) {
      toast.error("Subject is required")
      return
    }

    setSubmittingTicket(true)
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedContact.id,
          subject: ticketSubject.trim(),
          description: ticketDescription.trim() || null,
          severity: ticketSeverity,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create ticket")

      toast.success("Ticket created successfully")
      setIsTicketModalOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create ticket")
    } finally {
      setSubmittingTicket(false)
    }
  }

  // Handle Add Contact Form
  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim() || !addForm.phone.trim()) {
      toast.error("Name and Phone are required")
      return
    }
    const tagsArr = addForm.tags.split(",").map(t => t.trim()).filter(Boolean)
    addContactMutation.mutate({
      name: addForm.name.trim(),
      phone: addForm.phone.trim(),
      email: addForm.email.trim() || null,
      company: addForm.company.trim() || null,
      status: addForm.status,
      tags: tagsArr
    })
  }

  // Handle CSV Import
  const handleImportCsv = () => {
    setIsImporting(true)
    const runImport = (csvString: string) => {
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const parsed = results.data.map((row: any) => {
            const name = row.name || row.Name || row.full_name || row["Contact Name"] || "";
            const phone = row.phone || row.Phone || row["Phone Number"] || "";
            const email = row.email || row.Email || "";
            const company = row.company || row.Company || "";
            const status = row.status || row.Status || "Lead";
            const tags = row.tags || row.Tags ? String(row.tags || row.Tags).split(";").map(t => t.trim()) : [];
            return { name, phone, email, company, status, tags };
          }).filter(x => x.phone && x.name)

          if (parsed.length === 0) {
            toast.error("No valid contacts found in CSV. Make sure you have 'name' and 'phone' columns.")
            setIsImporting(false)
            return
          }

          try {
            const res = await fetch("/api/contacts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(parsed)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error ?? "Failed to save imported contacts")
            toast.success(`Imported ${data.contacts?.length ?? 0} contacts successfully!`)
            queryClient.invalidateQueries({ queryKey: ["contacts"] })
            setIsImportCsvOpen(false)
            setCsvFile(null)
            setCsvTextData("")
          } catch (e: any) {
            toast.error(e.message)
          } finally {
            setIsImporting(false)
          }
        }
      })
    }

    if (csvFile) {
      const reader = new FileReader()
      reader.onload = (e) => {
        runImport(e.target?.result as string)
      }
      reader.readAsText(csvFile)
    } else if (csvTextData.trim()) {
      runImport(csvTextData)
    } else {
      toast.error("Provide a file or paste CSV text data")
      setIsImporting(false)
    }
  }

  // Open Edit Mode in Drawer
  const handleStartDrawerEdit = () => {
    if (!selectedContact) return
    setDrawerEditName(selectedContact.name)
    setDrawerEditEmail(selectedContact.email === "—" ? "" : selectedContact.email)
    setDrawerEditCompany(selectedContact.company === "—" ? "" : selectedContact.company)
    setDrawerEditStatus(selectedContact.status)
    setIsEditingInDrawer(true)
  }

  // Save changes from Drawer edit
  const handleSaveDrawerEdit = () => {
    if (!selectedContact) return
    updateContactMutation.mutate({
      id: selectedContact.id,
      updates: {
        name: drawerEditName.trim(),
        email: drawerEditEmail.trim() || null,
        company: drawerEditCompany.trim() || null,
        status: drawerEditStatus
      }
    })
  }

  // Tag interactions inside Drawer
  const handleAddTagInDrawer = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && newTagInput.trim() && selectedContact) {
      const currentTags = selectedContact.tags || []
      if (currentTags.includes(newTagInput.trim())) {
        toast.info("Tag already exists")
        return
      }
      const updated = [...currentTags, newTagInput.trim()]
      updateContactMutation.mutate({
        id: selectedContact.id,
        updates: { tags: updated }
      })
      setNewTagInput("")
    }
  }

  const handleRemoveTagInDrawer = (tagToRemove: string) => {
    if (!selectedContact) return
    const updated = (selectedContact.tags || []).filter(t => t !== tagToRemove)
    updateContactMutation.mutate({
      id: selectedContact.id,
      updates: { tags: updated }
    })
  }

  // Toggle selection for bulk actions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedContactIds(filteredContacts.map(c => c.id))
    } else {
      setSelectedContactIds([])
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedContactIds(prev => [...prev, id])
    } else {
      setSelectedContactIds(prev => prev.filter(x => x !== id))
    }
  }

  // Filtering logic
  const filteredContacts = useMemo(() => {
    return contacts.filter((c: any) => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.tags && c.tags.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase())))
      
      let matchesFilter = true
      if (filterStatus === "Hot Leads") matchesFilter = c.status === "Lead"
      if (filterStatus === "Customers") matchesFilter = c.status === "Customer"
      
      return matchesSearch && matchesFilter
    })
  }, [contacts, searchQuery, filterStatus])

  // Aggregate stats
  const totalContacts = contacts.length
  const leadsCount = contacts.filter((c: any) => c.status === "Lead").length

  return (
    <div className="flex h-full flex-col relative overflow-hidden p-6 md:px-8 max-w-full w-full bg-gray-100/10">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Contacts Directory</h1>
          <p className="text-xs text-gray-500 mt-1 font-semibold">{totalContacts} database contacts synced</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsImportCsvOpen(true)}
            className="inline-flex items-center justify-center rounded-md text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 h-9 px-4 gap-2 transition-all"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button 
            onClick={() => setIsAddContactOpen(true)}
            className="inline-flex items-center justify-center rounded-md text-xs font-bold bg-[#10B981] hover:bg-[#10B981]/90 text-white h-9 px-4 gap-2 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="flex pb-6 flex-shrink-0 w-full">
        <div className="flex w-full bg-white rounded-xl border border-border shadow-sm overflow-hidden divide-x divide-border">
          {[
            { label: "Total Contacts", val: totalContacts, icon: Users, bg: "bg-[#10B981]/10 text-[#10B981]" },
            { label: "Hot Leads", val: leadsCount, icon: Sparkles, bg: "bg-amber-500/10 text-amber-600" },
            { label: "Customers", val: totalContacts - leadsCount, icon: Check, bg: "bg-emerald-500/10 text-emerald-600" },
            { label: "WhatsApp Active", val: leadsCount, icon: MessageCircle, bg: "bg-indigo-500/10 text-indigo-600" }
          ].map((stat, i) => (
            <div key={i} className="flex flex-1 items-center p-4 gap-4">
              <div className={cn("rounded-lg p-2.5 shrink-0", stat.bg)}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{stat.val}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between pb-4 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, number, email or tags..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="inline-flex items-center justify-center rounded-md text-xs font-semibold border border-border bg-white hover:bg-gray-100 h-9 px-4 gap-2 text-gray-500 shrink-0 shadow-sm transition-all">
            <Filter className="h-3.5 w-3.5" /> Filter list
          </button>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto hide-scrollbar">
          {["All Contacts", "Hot Leads", "Customers"].map((status) => (
             <button
               key={status}
               onClick={() => setFilterStatus(status)}
               className={cn(
                 "h-8 px-3 rounded-md text-xs font-semibold border transition-all shadow-xs shrink-0",
                 filterStatus === status 
                   ? "bg-[#10B981] text-white border-[#10B981]" 
                   : "bg-white text-gray-500 border-border hover:bg-gray-100 hover:text-gray-900"
               )}
             >
               {status}
             </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedContactIds.length > 0 && (
        <div className="bg-foreground text-background rounded-xl p-3 border border-border flex items-center justify-between gap-4 mb-4 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 shrink-0">
          <div className="flex items-center gap-2">
            <Badge className="bg-white/20 text-white font-bold">{selectedContactIds.length}</Badge>
            <span className="text-xs font-semibold">selected contacts</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsBulkTagOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 text-xs font-bold rounded-lg transition-colors"
            >
              <Tag className="h-3.5 w-3.5" /> Bulk Tag
            </button>
            <button 
              onClick={() => bulkUpdateStatusMutation.mutate({ ids: selectedContactIds, status: "Lead" })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 text-xs font-bold rounded-lg transition-colors"
            >
              Set Status: Lead
            </button>
            <button 
              onClick={() => bulkUpdateStatusMutation.mutate({ ids: selectedContactIds, status: "Customer" })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 text-xs font-bold rounded-lg transition-colors"
            >
              Set Status: Customer
            </button>
            <div className="w-px h-4 bg-white/25 mx-1" />
            <button 
              onClick={() => {
                if (confirm(`Delete ${selectedContactIds.length} contacts? This cannot be undone.`)) {
                  deleteContactsMutation.mutate(selectedContactIds)
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button onClick={() => setSelectedContactIds([])} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Contacts Table View */}
      <div className="bg-white rounded-xl flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead className="w-[50px] pl-4">
                <input 
                  type="checkbox" 
                  className="rounded border-border focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary" 
                  checked={filteredContacts.length > 0 && selectedContactIds.length === filteredContacts.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Name</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Phone</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Email</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Company</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Status</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Tags</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-gray-500 py-3">Last Activity</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs text-gray-900 divide-y">
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading contacts database...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                  No contacts match your query. Add a contact or import a CSV file to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow 
                  key={contact.id} 
                  className="cursor-pointer hover:bg-gray-100/30 transition-all"
                  onClick={() => setSelectedContact(contact)}
                >
                  <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="rounded border-border focus:ring-primary h-3.5 w-3.5 cursor-pointer accent-primary" 
                      checked={selectedContactIds.includes(contact.id)}
                      onChange={(e) => handleSelectOne(contact.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] font-bold bg-gray-100 text-gray-500">
                          {contact.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 py-2 font-mono">{contact.phone}</TableCell>
                  <TableCell className="text-gray-500 py-2">{contact.email}</TableCell>
                  <TableCell className="text-gray-500 py-2 font-medium">{contact.company}</TableCell>
                  <TableCell className="py-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                      contact.status === "Lead" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
                    )}>
                      {contact.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {contact.tags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} className="bg-primary/5 text-primary hover:bg-primary/10 border border-primary/10 font-semibold px-1 h-4 text-[9px] rounded">
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 3 && (
                        <Badge className="bg-gray-100 text-gray-500 font-semibold px-1 h-4 text-[9px] rounded">
                          +{contact.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 py-2">{contact.lastContact}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={() => {
                        if (confirm("Delete this contact? This action is permanent.")) {
                          deleteContactsMutation.mutate([contact.id])
                        }
                      }}
                      className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Drawer Overlay Backdrop */}
      {selectedContact && (
        <div 
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-xs transition-opacity duration-200 linear"
          onClick={() => { setSelectedContact(null); setIsEditingInDrawer(false) }}
        />
      )}

      {/* Contact Details Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 z-50 h-screen w-[420px] bg-white border-l border-border shadow-2xl transform flex flex-col",
          selectedContact ? "translate-x-0 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]" : "translate-x-full transition-transform duration-150 ease-in"
        )}
      >
        {selectedContact && (
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h2 className="font-bold text-[13px] text-gray-500 uppercase tracking-wider">Contact Profile</h2>
              <button 
                onClick={() => { setSelectedContact(null); setIsEditingInDrawer(false) }}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile card area */}
              <div className="flex flex-col items-center text-center pb-6 border-b border-border">
                <Avatar className="h-20 w-20 mb-3 shadow-md border-2 border-white">
                  <AvatarFallback className="text-2xl bg-gray-100 text-gray-900 font-black">
                    {selectedContact.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                {isEditingInDrawer ? (
                  <div className="w-full space-y-2.5 mt-2">
                    <Input value={drawerEditName} onChange={e => setDrawerEditName(e.target.value)} placeholder="Full Name" className="text-center font-semibold bg-white" />
                    <Input value={drawerEditEmail} onChange={e => setDrawerEditEmail(e.target.value)} placeholder="Email" className="text-center bg-white" />
                    <Input value={drawerEditCompany} onChange={e => setDrawerEditCompany(e.target.value)} placeholder="Company" className="text-center bg-white" />
                    <Select.Root value={drawerEditStatus} onValueChange={setDrawerEditStatus}>
                      <Select.Trigger className="w-full px-3 py-2 border rounded-lg bg-white text-xs flex items-center justify-between outline-none focus:ring-1 focus:ring-[#10B981]">
                        <Select.Value placeholder="Select status" />
                        <Select.Icon>
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden bg-white rounded-lg border border-border shadow-lg z-[70] min-w-[120px]">
                          <Select.Viewport className="p-1">
                            <Select.Item value="Lead" className="text-xs px-2 py-1.5 outline-none cursor-pointer rounded-md hover:bg-[#10B981]/10 focus:bg-[#10B981]/10 focus:text-[#10B981] font-medium data-[highlighted]:bg-[#10B981]/10 data-[highlighted]:text-[#10B981]">
                              <Select.ItemText>Lead</Select.ItemText>
                            </Select.Item>
                            <Select.Item value="Customer" className="text-xs px-2 py-1.5 outline-none cursor-pointer rounded-md hover:bg-[#10B981]/10 focus:bg-[#10B981]/10 focus:text-[#10B981] font-medium data-[highlighted]:bg-[#10B981]/10 data-[highlighted]:text-[#10B981]">
                              <Select.ItemText>Customer</Select.ItemText>
                            </Select.Item>
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                    <div className="flex justify-center gap-2 pt-1">
                      <button 
                        onClick={() => setIsEditingInDrawer(false)}
                        className="px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-gray-100 text-gray-500"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSaveDrawerEdit}
                        disabled={updateContactMutation.isPending}
                        className="px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-lg shadow"
                      >
                        {updateContactMutation.isPending ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-bold text-gray-900 leading-tight">{selectedContact.name}</h3>
                    <p className="text-xs text-gray-500 mt-1 font-semibold">{selectedContact.company}</p>
                    
                    <div className="flex flex-wrap gap-1.5 justify-center mt-3 mb-5">
                      <Badge className="bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 font-bold px-2 py-0.5 text-[10px] gap-1 border-transparent rounded-[6px]">
                        <Phone className="h-3 w-3" /> {selectedContact.phone}
                      </Badge>
                      <Badge className="bg-[#10B981]/10 text-[#10B981] hover:bg-[#10B981]/20 font-bold px-2 py-0.5 text-[10px] gap-1 border-transparent rounded-[6px]">
                        <Mail className="h-3 w-3" /> {selectedContact.email}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={handleStartDrawerEdit}
                        className="inline-flex items-center justify-center rounded-[6px] text-xs font-bold border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 h-9 px-4 gap-1.5 shadow-sm transition-all"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> Edit details
                      </button>
                      <button
                        onClick={() => {
                          setIsTicketModalOpen(true)
                          setTicketSubject("")
                          setTicketDescription("")
                          setTicketSeverity("medium")
                        }}
                        className="inline-flex items-center justify-center rounded-[6px] text-xs font-bold bg-[#10B981] hover:bg-[#10B981]/90 text-white h-9 px-4 gap-1.5 transition-all"
                      >
                        <Ticket className="h-3.5 w-3.5" /> Create Ticket
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Contact Sidebar for Tags and Custom Fields */}
              <div className="w-full mt-4 -mx-6 px-1">
                <ContactSidebar 
                  contact={selectedContact as any} 
                  hideHeader 
                  onContactUpdated={(updated: any) => {
                    // Update local state without full reload
                    setSelectedContact((prev: any) => ({
                      ...prev,
                      tags: updated.tags || [],
                      custom_fields: updated.custom_fields || {}
                    }));
                    queryClient.invalidateQueries({ queryKey: ["contacts"] });
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal - Add Contact */}
      {isAddContactOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[420px] rounded-[12px] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Add New Contact</h2>
              <button onClick={() => setIsAddContactOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddContactSubmit} className="p-5 space-y-4 text-xs text-gray-900">
              <div>
                <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Full Name *</label>
                <input required type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none" placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number *</label>
                  <input required type="text" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none" placeholder="+919876543210" />
                </div>
                <div>
                  <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none" placeholder="john@example.com" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Company Name</label>
                <input type="text" value={addForm.company} onChange={e => setAddForm({ ...addForm, company: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none" placeholder="Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                  <Select.Root value={addForm.status} onValueChange={(val) => setAddForm({ ...addForm, status: val })}>
                    <Select.Trigger className="w-full border border-border rounded-lg px-3 py-2 text-xs flex items-center justify-between outline-none focus:ring-1 focus:ring-[#10B981] bg-white transition-shadow">
                      <Select.Value placeholder="Select status" />
                      <Select.Icon>
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="overflow-hidden bg-white rounded-lg border border-border shadow-lg z-[70] min-w-[120px]">
                        <Select.Viewport className="p-1">
                          <Select.Item value="Lead" className="text-xs px-2 py-1.5 outline-none cursor-pointer rounded-md hover:bg-[#10B981]/10 focus:bg-[#10B981]/10 focus:text-[#10B981] font-medium data-[highlighted]:bg-[#10B981]/10 data-[highlighted]:text-[#10B981]">
                            <Select.ItemText>Lead</Select.ItemText>
                          </Select.Item>
                          <Select.Item value="Customer" className="text-xs px-2 py-1.5 outline-none cursor-pointer rounded-md hover:bg-[#10B981]/10 focus:bg-[#10B981]/10 focus:text-[#10B981] font-medium data-[highlighted]:bg-[#10B981]/10 data-[highlighted]:text-[#10B981]">
                            <Select.ItemText>Customer</Select.ItemText>
                          </Select.Item>
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div>
                  <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1">Tags (comma-separated)</label>
                  <input type="text" value={addForm.tags} onChange={e => setAddForm({ ...addForm, tags: e.target.value })} className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none" placeholder="VIP, warm-lead" />
                </div>
              </div>
              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsAddContactOpen(false)} className="px-4 py-2 border border-border rounded-lg font-bold hover:bg-gray-100 text-gray-500 bg-white">Cancel</button>
                <button type="submit" disabled={addContactMutation.isPending} className="px-4 py-2 bg-[#10B981] text-white font-bold rounded-lg shadow transition-all">
                  {addContactMutation.isPending ? "Adding..." : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Import CSV */}
      {isImportCsvOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[460px] rounded-[12px] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Import Contacts</h2>
              <button onClick={() => setIsImportCsvOpen(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-gray-900">
              <p className="text-gray-500 text-xs leading-relaxed">
                Import multiple contacts. Make sure you map columns for **name** and **phone** correctly. Optional columns include: *email*, *company*, *status*, and *tags* (semi-colon separated).
              </p>
              
              <div className="space-y-1.5">
                <label className="block font-bold text-gray-500 uppercase tracking-wider">Upload CSV File</label>
                <div className="border-2 border-dashed border-border hover:border-primary/55 rounded-xl p-6 text-center transition-colors relative cursor-pointer bg-gray-100/10 hover:bg-primary/5">
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={e => setCsvFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-7 w-7 mx-auto text-gray-500 mb-2" />
                  <span className="text-[11px] font-semibold text-gray-900 block">
                    {csvFile ? `Selected: ${csvFile.name}` : "Click to select CSV file"}
                  </span>
                  <span className="text-[9px] text-gray-500 mt-0.5 block">File size limit: 5MB</span>
                </div>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink mx-3 text-gray-500 text-[10px] uppercase font-bold tracking-widest">Or</span>
                <div className="flex-grow border-t border-border"></div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-gray-500 uppercase tracking-wider">Paste raw CSV text data</label>
                <textarea 
                  rows={4}
                  value={csvTextData}
                  onChange={e => setCsvTextData(e.target.value)}
                  placeholder="name,phone,email,company,status,tags&#10;John Doe,+919000000001,john@acme.com,Acme,Customer,VIP;warm-lead"
                  className="w-full border border-border rounded-xl p-2.5 font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-primary bg-gray-100/20"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsImportCsvOpen(false)} className="px-4 py-2 border border-border rounded-lg font-bold hover:bg-gray-100 text-gray-500 bg-white">Cancel</button>
                <button 
                  type="button" 
                  onClick={handleImportCsv}
                  disabled={isImporting || (!csvFile && !csvTextData.trim())}
                  className="px-4 py-2 bg-[#10B981] text-white font-bold rounded-lg shadow transition-all flex items-center gap-1.5"
                >
                  {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isImporting ? "Importing..." : "Process Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Bulk Tag */}
      {isBulkTagOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[380px] rounded-[12px] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Append Bulk Tags</h2>
              <button onClick={() => setIsBulkTagOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-gray-900">
              <p className="text-gray-500 text-xs leading-relaxed">
                Provide tags to add to all {selectedContactIds.length} selected contacts. Existing tags will not be overwritten.
              </p>
              <div>
                <label className="block font-bold text-gray-500 uppercase tracking-wider mb-1.5">Tags (comma-separated)</label>
                <input 
                  type="text" 
                  value={bulkTags}
                  onChange={e => setBulkTags(e.target.value)}
                  placeholder="VIP, campaign-july, inbound"
                  className="w-full border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[#10B981] outline-none"
                />
              </div>
              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsBulkTagOpen(false)} className="px-4 py-2 border border-border rounded-lg font-bold hover:bg-gray-100 text-gray-500 bg-white">Cancel</button>
                <button 
                  type="button" 
                  onClick={() => {
                    const tagList = bulkTags.split(",").map(t => t.trim()).filter(Boolean)
                    if (tagList.length === 0) {
                      toast.error("Provide at least one tag")
                      return
                    }
                    bulkAddTagsMutation.mutate({ ids: selectedContactIds, newTags: tagList })
                  }}
                  className="px-4 py-2 bg-[#10B981] text-white font-bold rounded-lg shadow transition-all"
                >
                  Append Tags
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Ticket Modal (Drawer trigger) */}
      {isTicketModalOpen && selectedContact && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[420px] rounded-[12px] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-[13px] font-bold text-gray-500 uppercase tracking-wider">Create Support Ticket</h2>
              <button 
                onClick={() => setIsTicketModalOpen(false)} 
                className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs text-gray-900">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact</label>
                <div className="px-3 py-2 border border-gray-200 rounded-[6px] bg-gray-50 font-medium">
                  <p className="font-semibold text-gray-900">{selectedContact.name}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{selectedContact.phone}</p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Issue with payment verification"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:ring-1 focus:ring-[#10B981] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</label>
                <textarea
                  placeholder="Provide details about the customer's request..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-[6px] text-xs focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Severity</label>
                <CustomSelect
                  value={ticketSeverity}
                  onValueChange={setTicketSeverity}
                  options={[
                    { label: "Low", value: "low" },
                    { label: "Medium", value: "medium" },
                    { label: "High", value: "high" },
                    { label: "Critical", value: "critical" },
                  ]}
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTicketModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-[6px] font-bold hover:bg-gray-50 text-gray-500 bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="px-4 py-2 bg-[#10B981] text-white font-bold rounded-[6px] shadow hover:bg-[#10B981]/90 transition-all flex items-center gap-1.5"
                >
                  {submittingTicket && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
