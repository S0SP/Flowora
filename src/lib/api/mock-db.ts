import { v4 as uuidv4 } from "uuid"

// Types
export interface Contact {
  id: string
  name: string
  email: string
  phone: string
  company: string
  status: "Active" | "Inactive" | "Lead" | "Customer"
  lastContact: string
  leadScore?: number
  engagement?: number
  intent?: number
  profileFit?: number
  location?: string
}

export interface Message {
  id: string
  threadId: string
  senderId: string // "me" or contact id or "bot"
  content: string
  timestamp: string
  type?: "text" | "pdf"
  fileName?: string
  fileSize?: string
}

export interface Thread {
  id: string
  contactId: string
  contactName: string
  lastMessage: string
  timestamp: string
  unread: boolean
  status: "open" | "closed" | "bot"
  tags: string[]
  assignedTo?: { name: string; role: string; initials: string; color: string }
  events?: { time: string; icon: string; label: string }[]
}

export interface Lead {
  id: string
  name: string
  company: string
  value: string
  status: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost"
}

// Initial Data
const initialContacts: Contact[] = [
  { id: "c1", name: "John Doe", email: "john.doe@email.com", phone: "+91 98765 43210", company: "TechFlow Inc", status: "Lead", lastContact: "2 hrs ago", leadScore: 82, engagement: 85, intent: 78, profileFit: 88, location: "Mumbai, India" },
  { id: "c2", name: "Sarah Wilson", email: "sarah@growthmetrics.com", phone: "+1 (555) 987-6543", company: "GrowthMetrics", status: "Lead", lastContact: "1 day ago", leadScore: 65, engagement: 40, intent: 60, profileFit: 70, location: "New York, USA" },
  { id: "c3", name: "Rakesh Sharma", email: "rakesh@stellarops.net", phone: "+91 98765 12345", company: "StellarOps", status: "Customer", lastContact: "3 days ago", leadScore: 95, engagement: 90, intent: 85, profileFit: 92, location: "Delhi, India" },
  { id: "c4", name: "Priya Patel", email: "priya@nexus.io", phone: "+91 98765 54321", company: "Nexus", status: "Active", lastContact: "4 hrs ago", leadScore: 40, engagement: 30, intent: 20, profileFit: 50, location: "Bangalore, India" },
  { id: "c5", name: "Alex Chen", email: "alex.chen@innovate.co", phone: "+65 8765 4321", company: "Innovate Co", status: "Lead", lastContact: "5 mins ago", leadScore: 89, engagement: 80, intent: 90, profileFit: 95, location: "Singapore" },
  { id: "c6", name: "Maria Garcia", email: "maria@designstudio.es", phone: "+34 600 123 456", company: "Design Studio", status: "Customer", lastContact: "2 hrs ago", leadScore: 75, engagement: 60, intent: 80, profileFit: 85, location: "Madrid, Spain" },
  { id: "c7", name: "James Smith", email: "jsmith@logistics.net", phone: "+44 7700 900123", company: "Logistics Net", status: "Lead", lastContact: "1 hr ago", leadScore: 55, engagement: 40, intent: 50, profileFit: 60, location: "London, UK" },
  { id: "c8", name: "Anita Kumar", email: "anita.k@fintech.in", phone: "+91 99887 76655", company: "FinTech India", status: "Lead", lastContact: "30 mins ago", leadScore: 92, engagement: 88, intent: 95, profileFit: 90, location: "Pune, India" },
  { id: "c9", name: "David Kim", email: "david.kim@seoultech.kr", phone: "+82 10 1234 5678", company: "Seoul Tech", status: "Active", lastContact: "6 hrs ago", leadScore: 78, engagement: 70, intent: 80, profileFit: 75, location: "Seoul, South Korea" },
]

const initialThreads: Thread[] = [
  { 
    id: "t1", contactId: "c1", contactName: "John Doe", lastMessage: "Yes, please share the pricing as well.", timestamp: "10:32 AM", unread: true, status: "open", tags: ["Hot Lead", "High Intent"],
    assignedTo: { name: "Rohan Mehta", role: "Sales Executive", initials: "RM", color: "bg-blue-500" },
    events: [
      { time: "10:32 AM", icon: "start", label: "Conversation Started" },
      { time: "10:25 AM", icon: "bot", label: "AI Bot Handled" },
      { time: "10:28 AM", icon: "user", label: "Human Assigned" },
      { time: "10:30 AM", icon: "doc", label: "Pricing PDF Shared" }
    ]
  },
  { id: "t2", contactId: "c2", contactName: "Sarah Wilson", lastMessage: "Can you share pricing?", timestamp: "10:28 AM", unread: true, status: "open", tags: [] },
  { id: "t5", contactId: "c5", contactName: "Alex Chen", lastMessage: "Let's schedule a call tomorrow.", timestamp: "10:20 AM", unread: true, status: "open", tags: ["Meeting Requested"] },
  { id: "t3", contactId: "c3", contactName: "Rakesh Sharma", lastMessage: "Thanks! Please call me.", timestamp: "10:15 AM", unread: false, status: "open", tags: ["Demo Requested"] },
  { id: "t8", contactId: "c8", contactName: "Anita Kumar", lastMessage: "The integration looks great. What's next?", timestamp: "10:10 AM", unread: true, status: "open", tags: ["Hot Lead", "Tech Review"] },
  { id: "t4", contactId: "c4", contactName: "Priya Patel", lastMessage: "Where is my invoice?", timestamp: "9:58 AM", unread: false, status: "open", tags: ["Human requested"] },
  { id: "t6", contactId: "c6", contactName: "Maria Garcia", lastMessage: "The new design is approved.", timestamp: "Yesterday", unread: false, status: "closed", tags: ["Customer"] },
  { id: "t7", contactId: "c7", contactName: "James Smith", lastMessage: "Send me the contract draft.", timestamp: "Yesterday", unread: false, status: "open", tags: ["Contract"] },
  { id: "t9", contactId: "c9", contactName: "David Kim", lastMessage: "Checking in on the API keys.", timestamp: "2 days ago", unread: false, status: "closed", tags: ["Support"] },
]

const initialMessages: Message[] = [
  { id: "m1", threadId: "t1", senderId: "c1", content: "Hello, I'm interested in your product.", timestamp: "2026-07-05T10:25:00Z" },
  { id: "m2", threadId: "t1", senderId: "bot", content: "Hi John 👋\n\nThanks for reaching out! Which product are you interested in?", timestamp: "2026-07-05T10:26:00Z" },
  { id: "m3", threadId: "t1", senderId: "c1", content: "I'm looking for a solution to automate my WhatsApp communication.", timestamp: "2026-07-05T10:27:00Z" },
  { id: "m4", threadId: "t1", senderId: "bot", content: "Great! Flowora can help you with that.\nWould you like me to share more details?", timestamp: "2026-07-05T10:27:30Z" },
  { id: "m5", threadId: "t1", senderId: "c1", content: "Yes, please share the pricing as well.", timestamp: "2026-07-05T10:28:00Z" },
  { id: "m6", threadId: "t1", senderId: "me", content: "Sure, sharing the details with you here.", timestamp: "2026-07-05T10:28:30Z" },
  { id: "m7", threadId: "t1", senderId: "me", content: "Flowora Pricing Guide.pdf", type: "pdf", fileName: "Flowora Pricing Guide.pdf", fileSize: "2.4 MB", timestamp: "2026-07-05T10:28:45Z" },
  
  { id: "m21", threadId: "t2", senderId: "c2", content: "Hi team", timestamp: "2026-07-05T10:20:00Z" },
  { id: "m22", threadId: "t2", senderId: "c2", content: "Can you share pricing?", timestamp: "2026-07-05T10:28:00Z" },
  
  { id: "m51", threadId: "t5", senderId: "c5", content: "I've reviewed the proposal.", timestamp: "2026-07-05T10:15:00Z" },
  { id: "m52", threadId: "t5", senderId: "c5", content: "Let's schedule a call tomorrow.", timestamp: "2026-07-05T10:20:00Z" },
]

const initialLeads: Lead[] = [
  { id: "l1", name: "Sarah Jenkins", company: "TechFlow Inc", value: "$4,500", status: "new" },
  { id: "l2", name: "Marcus Chen", company: "GrowthMetrics", value: "$12,000", status: "contacted" },
  { id: "l3", name: "David Miller", company: "Nexus Logic", value: "$2,400", status: "qualified" },
  { id: "l4", name: "Emily Clark", company: "Pioneer Tech", value: "$8,900", status: "proposal" },
  { id: "l5", name: "Anita Kumar", company: "FinTech India", value: "$15,500", status: "new" },
  { id: "l6", name: "Alex Chen", company: "Innovate Co", value: "$6,200", status: "qualified" },
]

// DB Helper
class MockDB {
  private get<T>(key: string, defaultValue: T): T {
    if (typeof window === "undefined") return defaultValue
    const stored = localStorage.getItem(`flowora_${key}`)
    if (stored) {
      try {
        return JSON.parse(stored) as T
      } catch (e) {
        return defaultValue
      }
    }
    this.set(key, defaultValue)
    return defaultValue
  }

  private set<T>(key: string, value: T) {
    if (typeof window !== "undefined") {
      localStorage.setItem(`flowora_${key}`, JSON.stringify(value))
    }
  }

  // Delay simulator
  private async delay(ms = 500) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // --- Contacts ---
  async getContacts(): Promise<Contact[]> {
    await this.delay(300)
    return this.get("contacts", initialContacts)
  }

  async addContact(contact: Omit<Contact, "id">): Promise<Contact> {
    await this.delay(300)
    const contacts = this.get("contacts", initialContacts)
    const newContact = { ...contact, id: uuidv4() }
    this.set("contacts", [newContact, ...contacts])
    return newContact
  }

  // --- Inbox ---
  async getThreads(): Promise<Thread[]> {
    await this.delay(300)
    return this.get("threads", initialThreads)
  }

  async getMessages(threadId: string): Promise<Message[]> {
    await this.delay(300)
    const messages = this.get("messages", initialMessages)
    return messages.filter(m => m.threadId === threadId)
  }

  async sendMessage(threadId: string, content: string): Promise<Message> {
    await this.delay(400)
    const messages = this.get("messages", initialMessages)
    const threads = this.get("threads", initialThreads)
    
    const newMessage: Message = {
      id: uuidv4(),
      threadId,
      senderId: "me",
      content,
      timestamp: new Date().toISOString()
    }
    
    this.set("messages", [...messages, newMessage])
    
    // Update thread lastMessage
    const updatedThreads = threads.map(t => {
      if (t.id === threadId) {
        return { ...t, lastMessage: content, timestamp: "Just now" }
      }
      return t
    })
    this.set("threads", updatedThreads)
    
    return newMessage
  }

  // --- Leads ---
  async getLeads(): Promise<Lead[]> {
    await this.delay(300)
    return this.get("leads", initialLeads)
  }

  async updateLeadStatus(leadId: string, newStatus: Lead["status"]): Promise<Lead> {
    await this.delay(200) // fast UI response
    const leads = this.get("leads", initialLeads)
    const updated = leads.map(l => l.id === leadId ? { ...l, status: newStatus } : l)
    this.set("leads", updated)
    return updated.find(l => l.id === leadId)!
  }

  async addLead(lead: Omit<Lead, "id">): Promise<Lead> {
    await this.delay(300)
    const leads = this.get("leads", initialLeads)
    const newLead = { ...lead, id: uuidv4() }
    this.set("leads", [...leads, newLead])
    return newLead
  }

  async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead> {
    await this.delay(300)
    const leads = this.get("leads", initialLeads)
    let updatedLead: Lead | undefined
    const newLeads = leads.map(l => {
      if (l.id === leadId) {
        updatedLead = { ...l, ...updates }
        return updatedLead
      }
      return l
    })
    if (!updatedLead) throw new Error("Lead not found")
    this.set("leads", newLeads)
    return updatedLead
  }
}

export const mockDb = new MockDB()
