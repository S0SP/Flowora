"use client"

import React, { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { 
  Upload, Plus, Users, MessageCircle, Search, SlidersHorizontal, 
  MoreHorizontal, X, MessageSquare, Phone, Mail, Ticket, Loader2,
  Trash2, Tag, Check, Edit2, AlertCircle, Sparkles, Filter
} from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/atoms/Input"
import { Badge } from "@/components/atoms/Badge"
import { Avatar, AvatarFallback } from "@/components/atoms/Avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, formatRelativeTime } from "@/lib/utils"
import Papa from "papaparse"

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: string
  tags: string[]
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
          tags: data.contact.tags || []
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
    <div className="flex h-full flex-col relative overflow-hidden p-6 md:px-8 max-w-full w-full bg-muted/10">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Contacts Directory</h1>
          <p className="text-xs text-muted-foreground mt-1 font-semibold">{totalContacts} database contacts synced</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsImportCsvOpen(true)}
            className="inline-flex items-center justify-center rounded-lg text-xs font-semibold border border-border bg-white hover:bg-muted text-muted-foreground h-9 px-4 gap-2 shadow-sm transition-all"
          >
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button 
            onClick={() => setIsAddContactOpen(true)}
            className="inline-flex items-center justify-center rounded-lg text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 gap-2 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" /> Add Contact
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-6 flex-shrink-0">
        {[
          { label: "Total Contacts", val: totalContacts, icon: Users, bg: "bg-primary/10 text-primary border-primary/10" },
          { label: "Hot Leads", val: leadsCount, icon: Sparkles, bg: "bg-amber-500/10 text-amber-600 border-amber-500/10" },
          { label: "Customers", val: totalContacts - leadsCount, icon: Check, bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/10" },
          { label: "WhatsApp Active", val: leadsCount, icon: MessageCircle, bg: "bg-indigo-500/10 text-indigo-600 border-indigo-500/10" }
        ].map((stat, i) => (
          <div key={i} className="flex items-center p-4 bg-white rounded-xl border border-border shadow-sm gap-4">
            <div className={cn("rounded-lg p-2.5 shrink-0 border", stat.bg)}>
              <stat.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stat.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between pb-4 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, number, email or tags..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="inline-flex items-center justify-center rounded-xl text-xs font-semibold border border-border bg-white hover:bg-muted h-9 px-4 gap-2 text-muted-foreground shrink-0 shadow-sm transition-all">
            <Filter className="h-3.5 w-3.5" /> Filter list
          </button>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 hide-scrollbar">
          {["All Contacts", "Hot Leads", "Customers"].map((status) => (
             <button
               key={status}
               onClick={() => setFilterStatus(status)}
               className={cn(
                 "h-8 px-3 rounded-lg text-xs font-semibold border transition-all shadow-xs shrink-0",
                 filterStatus === status 
                   ? "bg-primary text-primary-foreground border-primary" 
                   : "bg-white text-muted-foreground border-border hover:bg-muted hover:text-foreground"
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
      <div className="bg-white rounded-xl border border-border shadow-sm flex-1 overflow-auto">
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
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Name</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Phone</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Email</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Company</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Status</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Tags</TableHead>
              <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground py-3">Last Activity</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs text-foreground divide-y">
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading contacts database...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  No contacts match your query. Add a contact or import a CSV file to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow 
                  key={contact.id} 
                  className="cursor-pointer hover:bg-muted/30 transition-all"
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
                  <TableCell className="font-semibold text-foreground py-3.5">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px] font-bold bg-[#FFE27C] text-foreground">
                          {contact.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span>{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3.5 font-mono">{contact.phone}</TableCell>
                  <TableCell className="text-muted-foreground py-3.5">{contact.email}</TableCell>
                  <TableCell className="text-muted-foreground py-3.5 font-medium">{contact.company}</TableCell>
                  <TableCell className="py-3.5">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                      contact.status === "Lead" ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    )}>
                      {contact.status}
                    </span>
                  </TableCell>
                  <TableCell className="py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {contact.tags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} className="bg-primary/5 text-primary hover:bg-primary/10 border border-primary/10 font-semibold px-1 h-4 text-[9px] rounded">
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 3 && (
                        <Badge className="bg-muted text-muted-foreground font-semibold px-1 h-4 text-[9px] rounded">
                          +{contact.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground py-3.5">{contact.lastContact}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <button 
                      onClick={() => {
                        if (confirm("Delete this contact? This action is permanent.")) {
                          deleteContactsMutation.mutate([contact.id])
                        }
                      }}
                      className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-xs transition-opacity"
          onClick={() => { setSelectedContact(null); setIsEditingInDrawer(false) }}
        />
      )}

      {/* Contact Details Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 z-50 h-screen w-[420px] bg-white border-l border-border shadow-2xl transition-transform duration-300 transform flex flex-col",
          selectedContact ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedContact && (
          <div className="flex flex-col h-full overflow-hidden bg-white">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h2 className="font-bold text-sm text-foreground uppercase tracking-wider">Contact Profile</h2>
              <button 
                onClick={() => { setSelectedContact(null); setIsEditingInDrawer(false) }}
                className="p-1.5 hover:bg-muted rounded-full text-muted-foreground transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile card area */}
              <div className="flex flex-col items-center text-center pb-6 border-b border-border">
                <Avatar className="h-20 w-20 mb-3 shadow-md border-2 border-white">
                  <AvatarFallback className="text-2xl bg-gradient-to-tr from-primary to-lavender text-foreground font-black">
                    {selectedContact.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                
                {isEditingInDrawer ? (
                  <div className="w-full space-y-2.5 mt-2">
                    <Input value={drawerEditName} onChange={e => setDrawerEditName(e.target.value)} placeholder="Full Name" className="text-center font-semibold bg-white" />
                    <Input value={drawerEditEmail} onChange={e => setDrawerEditEmail(e.target.value)} placeholder="Email" className="text-center bg-white" />
                    <Input value={drawerEditCompany} onChange={e => setDrawerEditCompany(e.target.value)} placeholder="Company" className="text-center bg-white" />
                    <select 
                      value={drawerEditStatus} 
                      onChange={e => setDrawerEditStatus(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl bg-white text-xs focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="Lead">Lead</option>
                      <option value="Customer">Customer</option>
                    </select>
                    <div className="flex justify-center gap-2 pt-1">
                      <button 
                        onClick={() => setIsEditingInDrawer(false)}
                        className="px-3 py-1.5 border rounded-lg text-xs font-semibold hover:bg-muted text-muted-foreground"
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
                    <h3 className="text-lg font-bold text-foreground leading-tight">{selectedContact.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 font-semibold">{selectedContact.company}</p>
                    
                    <div className="flex flex-wrap gap-1.5 justify-center mt-3 mb-5">
                      <Badge className="bg-primary/5 text-primary hover:bg-primary/10 font-bold px-2 py-0.5 text-[10px] gap-1 border-transparent rounded">
                        <Phone className="h-3 w-3" /> {selectedContact.phone}
                      </Badge>
                      <Badge className="bg-chart-3/5 text-chart-3 hover:bg-chart-3/10 font-bold px-2 py-0.5 text-[10px] gap-1 border-transparent rounded">
                        <Mail className="h-3 w-3" /> {selectedContact.email}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button 
                        onClick={handleStartDrawerEdit}
                        className="inline-flex items-center justify-center rounded-xl text-xs font-bold border border-border bg-white hover:bg-muted h-9 px-4 gap-1.5 shadow-sm transition-all"
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
                        className="inline-flex items-center justify-center rounded-xl text-xs font-bold border border-amber-200 bg-amber-50 hover:bg-amber-100/50 text-amber-700 h-9 px-4 gap-1.5 transition-all"
                      >
                        <Ticket className="h-3.5 w-3.5" /> Create Ticket
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Tags Area */}
              <div className="py-2 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tags & Labels</h4>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedContact.tags && selectedContact.tags.map((tag, idx) => (
                    <span 
                      key={idx}
                      className="inline-flex items-center gap-1 bg-primary/5 text-primary border border-primary/20 rounded-md px-2 py-0.5 text-[10px] font-bold"
                    >
                      {tag}
                      <button onClick={() => handleRemoveTagInDrawer(tag)} className="hover:text-red-500">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  {(!selectedContact.tags || selectedContact.tags.length === 0) && (
                    <span className="text-xs text-muted-foreground italic">No tags assigned.</span>
                  )}
                </div>
                <div className="relative mt-2">
                  <Tag className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={handleAddTagInDrawer}
                    placeholder="Type new tag and press Enter..."
                    className="w-full pl-8 pr-3 py-1.5 border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-muted/20 focus:bg-white transition-all"
                  />
                </div>
              </div>
              
              {/* Properties Area */}
              <div className="py-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">System Properties</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/40">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Status</p>
                    <p className="text-xs font-bold text-foreground mt-0.5">{selectedContact.status}</p>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border/40">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Last Activity</p>
                    <p className="text-xs font-bold text-foreground mt-0.5">{selectedContact.lastContact}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal - Add Contact */}
      {isAddContactOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-[420px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Add New Contact</h2>
              <button onClick={() => setIsAddContactOpen(false)} className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddContactSubmit} className="p-5 space-y-4 text-xs text-foreground">
              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Full Name *</label>
                <input required type="text" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Phone Number *</label>
                  <input required type="text" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="+919876543210" />
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="john@example.com" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Company Name</label>
                <input type="text" value={addForm.company} onChange={e => setAddForm({ ...addForm, company: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Status</label>
                  <select value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none bg-white">
                    <option value="Lead">Lead</option>
                    <option value="Customer">Customer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Tags (comma-separated)</label>
                  <input type="text" value={addForm.tags} onChange={e => setAddForm({ ...addForm, tags: e.target.value })} className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none" placeholder="VIP, warm-lead" />
                </div>
              </div>
              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsAddContactOpen(false)} className="px-4 py-2 border border-border rounded-xl font-bold hover:bg-muted text-muted-foreground bg-white">Cancel</button>
                <button type="submit" disabled={addContactMutation.isPending} className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl shadow transition-all">
                  {addContactMutation.isPending ? "Adding..." : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Import CSV */}
      {isImportCsvOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-[460px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Import Contacts</h2>
              <button onClick={() => setIsImportCsvOpen(false)} className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-foreground">
              <p className="text-muted-foreground text-xs leading-relaxed">
                Import multiple contacts. Make sure you map columns for **name** and **phone** correctly. Optional columns include: *email*, *company*, *status*, and *tags* (semi-colon separated).
              </p>
              
              <div className="space-y-1.5">
                <label className="block font-bold text-muted-foreground uppercase tracking-wider">Upload CSV File</label>
                <div className="border-2 border-dashed border-border hover:border-primary/55 rounded-xl p-6 text-center transition-colors relative cursor-pointer bg-muted/10 hover:bg-primary/5">
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={e => setCsvFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                  <span className="text-[11px] font-semibold text-foreground block">
                    {csvFile ? `Selected: ${csvFile.name}` : "Click to select CSV file"}
                  </span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 block">File size limit: 5MB</span>
                </div>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink mx-3 text-muted-foreground text-[10px] uppercase font-bold tracking-widest">Or</span>
                <div className="flex-grow border-t border-border"></div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-muted-foreground uppercase tracking-wider">Paste raw CSV text data</label>
                <textarea 
                  rows={4}
                  value={csvTextData}
                  onChange={e => setCsvTextData(e.target.value)}
                  placeholder="name,phone,email,company,status,tags&#10;John Doe,+919000000001,john@acme.com,Acme,Customer,VIP;warm-lead"
                  className="w-full border border-border rounded-xl p-2.5 font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-primary bg-muted/20"
                />
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsImportCsvOpen(false)} className="px-4 py-2 border border-border rounded-xl font-bold hover:bg-muted text-muted-foreground bg-white">Cancel</button>
                <button 
                  type="button" 
                  onClick={handleImportCsv}
                  disabled={isImporting || (!csvFile && !csvTextData.trim())}
                  className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl shadow transition-all flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-[380px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Append Bulk Tags</h2>
              <button onClick={() => setIsBulkTagOpen(false)} className="p-1.5 hover:bg-muted rounded-full text-muted-foreground transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-foreground">
              <p className="text-muted-foreground text-xs leading-relaxed">
                Provide tags to add to all {selectedContactIds.length} selected contacts. Existing tags will not be overwritten.
              </p>
              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Tags (comma-separated)</label>
                <input 
                  type="text" 
                  value={bulkTags}
                  onChange={e => setBulkTags(e.target.value)}
                  placeholder="VIP, campaign-july, inbound"
                  className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button type="button" onClick={() => setIsBulkTagOpen(false)} className="px-4 py-2 border border-border rounded-xl font-bold hover:bg-muted text-muted-foreground bg-white">Cancel</button>
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
                  className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl shadow transition-all"
                >
                  Append Tags
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Ticket Modal (Drawer trigger) */}
      {isTicketModalOpen && selectedContact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-[420px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Create Support Ticket</h2>
              <button 
                onClick={() => setIsTicketModalOpen(false)} 
                className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs text-foreground">
              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Contact</label>
                <div className="px-3 py-2 border rounded-xl bg-muted/30 font-medium">
                  <p className="font-semibold">{selectedContact.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{selectedContact.phone}</p>
                </div>
              </div>

              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Issue with payment verification"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Description</label>
                <textarea
                  placeholder="Provide details about the customer's request..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary outline-none resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-muted-foreground uppercase tracking-wider mb-1">Severity</label>
                <select
                  value={ticketSeverity}
                  onChange={(e) => setTicketSeverity(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary outline-none bg-white cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsTicketModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-xl font-bold hover:bg-muted text-muted-foreground bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="px-4 py-2 bg-primary text-primary-foreground font-bold rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  {submittingTicket && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
