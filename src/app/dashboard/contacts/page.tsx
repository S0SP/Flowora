"use client"

import React, { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Upload, Plus, Users, MessageCircle, Search, SlidersHorizontal, MoreHorizontal, X, MessageSquare, Phone, Mail } from "lucide-react"
import { Input } from "@/components/atoms/Input"
import { Badge } from "@/components/atoms/Badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/atoms/Avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn, formatRelativeTime } from "@/lib/utils"

export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: string
  lastContact: string
}

export default function ContactsPage() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<string>("All Contacts")

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await fetch("/api/contacts")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      return (data.contacts ?? []).map((c: any) => ({
        id: c.id,
        name: c.full_name || "Unknown",
        email: c.email || "—",
        phone: c.phone || "—",
        company: "—",
        status: c.status || "Lead",
        lastContact: c.last_message_at ? formatRelativeTime(c.last_message_at) : "—",
      }))
    },
  })

  // Filtering logic
  const filteredContacts = useMemo(() => {
    return contacts.filter((c: any) => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            c.phone.toLowerCase().includes(searchQuery.toLowerCase())
      
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
    <div className="flex h-full flex-col relative overflow-hidden p-6 md:px-8 max-w-full w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">{totalContacts} total contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 h-9 px-4 py-2 gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 h-9 px-4 py-2 gap-2">
            <Plus className="h-4 w-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-6">
        <div className="flex items-center p-4 bg-card rounded-lg border shadow-subtle gap-4">
          <div className="rounded-full bg-muted p-2 text-muted-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Contacts</p>
            <p className="text-xl font-bold">{totalContacts}</p>
          </div>
        </div>
        <div className="flex items-center p-4 bg-card rounded-lg border shadow-subtle gap-4">
          <div className="rounded-full bg-chart-4/20 p-2 text-chart-4">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Added This Week</p>
            <p className="text-xl font-bold text-chart-4">+12</p>
          </div>
        </div>
        <div className="flex items-center p-4 bg-card rounded-lg border shadow-subtle gap-4">
          <div className="rounded-full bg-chart-4/20 p-2 text-chart-4">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">WhatsApp Opted In</p>
            <p className="text-xl font-bold">{leadsCount}</p>
          </div>
        </div>
        <div className="flex items-center p-4 bg-card rounded-lg border shadow-subtle gap-4">
          <div className="rounded-full bg-muted p-2 text-muted-foreground">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Subscribed to Email</p>
            <p className="text-xl font-bold">{totalContacts - leadsCount}</p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between pb-4 gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:w-[320px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by name, number, email..."
              className="pl-9 w-full bg-card"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border bg-card hover:bg-muted h-10 px-4 py-2 gap-2 text-muted-foreground shrink-0">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 hide-scrollbar">
          {["All Contacts", "Hot Leads", "Customers"].map((status) => (
             <Badge 
               key={status}
               variant={filterStatus === status ? "default" : "secondary"}
               className={cn("h-8 px-3 rounded-md cursor-pointer shrink-0")}
               onClick={() => setFilterStatus(status)}
             >
               {status}
             </Badge>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border shadow-subtle flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[40px] pl-4">
                <input type="checkbox" className="rounded border-gray-300" />
              </TableHead>
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead className="w-[160px]">Phone</TableHead>
              <TableHead className="w-[200px]">Email</TableHead>
              <TableHead className="w-[140px]">Company</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-[140px]">Last Contact</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Loading contacts...</TableCell>
              </TableRow>
            ) : filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No contacts found.</TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact: any) => (
                <TableRow 
                  key={contact.id} 
                  className="cursor-pointer hover:bg-muted/50 data-[state=selected]:bg-accent"
                  onClick={() => setSelectedContact(contact)}
                  data-state={selectedContact?.id === contact.id ? "selected" : undefined}
                >
                  <TableCell className="pl-4">
                    <input type="checkbox" className="rounded border-gray-300" onClick={e => e.stopPropagation()} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{contact.name.split(" ").map((n: any) => n[0]).join("")}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{contact.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.email}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.company}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      contact.status === "Lead" ? "border-chart-4 text-chart-4" : 
                      contact.status === "Customer" ? "border-chart-3 text-chart-3" : ""
                    )}>
                      {contact.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{contact.lastContact}</TableCell>
                  <TableCell>
                    <button className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted" onClick={e => e.stopPropagation()}>
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Drawer Overlay */}
      {selectedContact && (
        <div 
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={() => setSelectedContact(null)}
        />
      )}

      {/* Contact Detail Drawer */}
      <div 
        className={cn(
          "fixed top-0 right-0 z-50 h-screen w-[440px] bg-card border-l shadow-2xl transition-transform duration-300 transform",
          selectedContact ? "translate-x-0" : "translate-x-full"
        )}
      >
        {selectedContact && (
          <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">Contact Details</h2>
              <button 
                onClick={() => setSelectedContact(null)}
                className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              {/* Profile Header */}
              <div className="flex flex-col items-center text-center pb-6 border-b">
                <Avatar className="h-20 w-20 mb-4 shadow-sm border-2 border-white">
                  <AvatarFallback className="text-2xl bg-gradient-to-tr from-sky-400 to-blue-600 text-white">
                    {selectedContact.name.split(" ").map(n => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-bold">{selectedContact.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{selectedContact.company}</p>
                
                <div className="flex gap-2 justify-center mb-6">
                  <Badge className="bg-chart-4/10 text-chart-4 hover:bg-chart-4/20 px-3 py-1 text-xs gap-1 border-transparent font-medium">
                    <MessageCircle className="h-3 w-3" />
                    {selectedContact.phone}
                  </Badge>
                  <Badge className="bg-chart-3/10 text-chart-3 hover:bg-chart-3/20 px-3 py-1 text-xs gap-1 border-transparent font-medium">
                    <Mail className="h-3 w-3" />
                    {selectedContact.email}
                  </Badge>
                </div>
                
                <div className="flex gap-3 w-full">
                  <button className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </button>
                  <button className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none border bg-card hover:bg-muted h-9 px-4 py-2 gap-2">
                    <Phone className="h-4 w-4" />
                    Call
                  </button>
                  <button className="flex-1 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none border bg-card hover:bg-muted h-9 px-4 py-2 gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </button>
                </div>
              </div>
              
              {/* Attributes */}
              <div className="py-6 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold">Contact Details</h4>
                  <button className="text-sm text-muted-foreground hover:text-foreground font-medium">Edit</button>
                </div>
                <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <p className="text-sm font-medium">{selectedContact.status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Company</p>
                    <p className="text-sm font-medium">{selectedContact.company}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Last Contact</p>
                    <p className="text-sm font-medium">{selectedContact.lastContact}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
