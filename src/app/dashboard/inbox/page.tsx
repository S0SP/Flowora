"use client"

import { Toggle } from "@/components/ui/toggle";
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import DatePicker from "react-datepicker"
import "react-datepicker/dist/react-datepicker.css"
import { useWorkspace } from "@/context/WorkspaceContext"
import { useInboxRealtime } from "@/hooks/use-inbox-realtime"
import {
  Search, Send, User, UserCheck, Phone, Tag, Paperclip, ChevronDown,
  Loader2, RefreshCw, CheckCheck, Check, MessageSquare, Archive,
  Bot as BotIcon, StickyNote, Image as ImageIcon, FileText, Music,
  Video, X, Plus, Ticket, ExternalLink, AlertTriangle, MoreHorizontal,
  SlidersHorizontal, Calendar, StickyNote as NoteIcon, Upload,
  PanelRightOpen, PanelRightClose
} from "lucide-react"
import { cn, formatRelativeTime } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { format } from "date-fns"
import Papa from "papaparse"

// ── Types ─────────────────────────────────────────────────────────────────────

type ThreadStatus = "open" | "closed" | "archived"
type SenderType = "contact" | "agent" | "bot" | "system"
type Contact = {
  id: string; full_name: string | null; phone: string
  email: string | null; avatar_url: string | null
  tags?: string[] | null
}
type Thread = {
  id: string; status: ThreadStatus; channel: string; assigned_to: string | null
  ai_active: boolean; unread_count: number; last_message_at: string
  last_message_preview: string | null; tags: string[] | null; priority: string
  contacts: Contact | null
}
type Message = {
  id: string; thread_id: string; content: string | null; type: string; sender_type: SenderType
  status: string; created_at: string; file_url: string | null
  file_name: string | null; metadata?: Record<string, any>
}

type TeamMember = { id: string; user_id: string | null; full_name: string | null; email: string }
type ActiveTicket = { id: string; ref: number; subject: string; status: string; severity: string } | null

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string | null, phone: string) {
  if (name) return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  return phone.slice(-2)
}

function Avatar({ name, phone, avatarUrl, size = 36 }: { name: string | null; phone: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || phone}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  const initials = getInitials(name, phone)
  const hue = phone.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 360
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue}, 60%, 55%)`, fontSize: size * 0.35 }}>
      {initials}
    </div>
  )
}

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400", 
  medium: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  high: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400", 
  critical: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
}
const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400", 
  assigned: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400",
  in_progress: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400", 
  escalated: "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  resolved: "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400", 
  closed: "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400",
}

function get24HourWindowStatus(messagesList: Message[]) {
  const lastIncoming = [...messagesList]
    .reverse()
    .find(m => m.sender_type === "contact");

  if (!lastIncoming) return { active: false, text: "No free window", tooltip: "Send messages will cost charges" };

  const lastTime = new Date(lastIncoming.created_at).getTime();
  const expireTime = lastTime + 24 * 60 * 60 * 1000;
  const timeLeft = expireTime - Date.now();

  if (timeLeft > 0) {
    const hours = Math.floor(timeLeft / (3600000));
    const mins = Math.floor((timeLeft % 3600000) / 60000);
    return {
      active: true,
      text: `${hours}h ${mins}m left`,
      tooltip: "Free reply window active. You can reply without charges."
    };
  } else {
    return {
      active: false,
      text: "Expired",
      tooltip: "24-hour free reply window has expired. Messages will cost charges."
    };
  }
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isOutbound = msg.sender_type === "agent" || msg.sender_type === "bot"
  const isNote = msg.metadata?.is_note === true
  const isSystem = msg.sender_type === "system" && !isNote

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{msg.content}</span>
      </div>
    )
  }

  if (isNote) {
    return (
      <div className="flex justify-center my-1">
        <div className="max-w-[85%] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <StickyNote className="h-3 w-3 text-amber-500 dark:text-amber-400" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Internal note</span>
          </div>
          <p className="text-[12px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{msg.content}</p>
          <span className="text-[10px] text-amber-500 dark:text-amber-500/70 mt-0.5 block">{format(new Date(msg.created_at), "HH:mm")}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex gap-2 max-w-[80%]", isOutbound ? "ml-auto flex-row-reverse" : "mr-auto")}>
      <div className={cn("px-3 py-2 rounded-2xl text-[13px] leading-relaxed shadow-sm",
        isOutbound 
          ? "bg-[#DCF8C6] dark:bg-emerald-950/60 text-gray-900 dark:text-emerald-100 rounded-br-none" 
          : "bg-white dark:bg-zinc-800 border border-border/60 dark:border-zinc-700 rounded-bl-none text-gray-900 dark:text-gray-100"
      )}>
        {msg.sender_type === "bot" && (
          <div className="flex items-center gap-1 mb-1">
            <BotIcon className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] text-purple-500 font-medium">AI · auto</span>
          </div>
        )}

        {/* Media rendering */}
        {msg.type === "image" && msg.file_url && (
          <img src={msg.file_url} alt="Image" className="max-w-[220px] rounded-lg mb-1" />
        )}
        {msg.type === "document" && (
          <div className="flex items-center gap-2 bg-black/5 rounded-lg px-2 py-1.5 mb-1">
            <FileText className="h-4 w-4 shrink-0" />
            <a href={msg.file_url ?? "#"} target="_blank" rel="noopener noreferrer"
              className="text-[12px] hover:underline truncate max-w-[160px]">
              {msg.file_name ?? "Document"}
            </a>
          </div>
        )}
        {msg.type === "audio" && msg.file_url && (
          <audio controls src={msg.file_url} className="max-w-[220px] mb-1" />
        )}
        {msg.type === "video" && msg.file_url && (
          <video controls src={msg.file_url} className="max-w-[220px] rounded-lg mb-1" />
        )}

        {msg.content && <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{msg.content}</p>}

        <div className={cn("flex items-center gap-1 mt-1", isOutbound ? "justify-end" : "justify-start")}>
          <span className="text-[10px] text-gray-500/70">{format(new Date(msg.created_at), "HH:mm")}</span>
          {isOutbound && (
            msg.status === "read" ? <CheckCheck className="h-3 w-3 text-blue-500" />
              : msg.status === "delivered" ? <CheckCheck className="h-3 w-3 text-gray-500/50" />
                : <Check className="h-3 w-3 text-gray-500/50" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

function ComposerInput({ composerMode, pendingMedia, sending, uploadingMedia, onSend, threadId }: { composerMode: string; pendingMedia: any; sending: boolean; uploadingMedia: boolean; onSend: (text: string) => Promise<boolean>; threadId: string; }) {
  const [text, setText] = useState("")
  useEffect(() => { setText("") }, [threadId, composerMode])

  const handleSend = async () => {
    if (sending || uploadingMedia || (composerMode !== "template" && !text.trim() && !pendingMedia)) return;
    const success = await onSend(text);
    if (success) setText("");
  };

  return (
    <div className="flex items-end gap-2">
      <div className={cn("flex-1 rounded-xl px-3 py-2 min-h-[44px] flex items-end", composerMode === "note" ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50" : "bg-gray-100 dark:bg-zinc-800")}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { 
              e.preventDefault(); 
              handleSend();
            }
          }}
          className="w-full bg-transparent text-[13px] text-gray-900 dark:text-gray-100 outline-none resize-none max-h-32 placeholder:text-gray-500 dark:placeholder:text-gray-500"
          rows={1}
          placeholder={composerMode === "note" ? "Add internal note..." : composerMode === "template" ? "Template will be sent..." : "Type a message... (Enter to send)"}
          disabled={composerMode === "template"}
        />
      </div>
      <button
        onClick={handleSend}
        disabled={sending || uploadingMedia || (composerMode !== "template" && !text.trim() && !pendingMedia)}
        className="p-2.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 transition-all shrink-0">
        {sending || uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function InboxPage() {
  const router = useRouter()
  const supabase = createClient()

  const [threads, setThreads] = useState<Thread[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [activeTicket, setActiveTicket] = useState<ActiveTicket>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [isSmartCardsCollapsed, setIsSmartCardsCollapsed] = useState(false)
  const [composerMode, setComposerMode] = useState<"message" | "note" | "template">("message")
  const [sending, setSending] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<{
    file: File; type: "image" | "document" | "audio" | "video"; preview?: string
  } | null>(null)
  const [creatingTicket, setCreatingTicket] = useState(false)

  const [isAddNoteModalOpen, setIsAddNoteModalOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [followupDate, setFollowupDate] = useState("")
  const [leadStatus, setLeadStatus] = useState<string | null>(null)
  const [notesFilter, setNotesFilter] = useState<"active" | "all">("active")
  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState("")

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [filterActiveTab, setFilterActiveTab] = useState<"status" | "assigned" | "tags" | "followups" | "date">("status")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterAssignedTo, setFilterAssignedTo] = useState<string>("all")
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterFollowups, setFilterFollowups] = useState<string>("all")
  const [filterDateOption, setFilterDateOption] = useState<string>("all")
  const [filterStartDate, setFilterStartDate] = useState<string>("")
  const [filterEndDate, setFilterEndDate] = useState<string>("")

  const [metaTemplates, setMetaTemplates] = useState<{ name: string; language: string; display_name: string; category: string }[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")

  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false)
  const [newChatTab, setNewChatTab] = useState<"single" | "bulk">("single")
  const [newChatName, setNewChatName] = useState("")
  const [newChatCountryCode, setNewChatCountryCode] = useState("+91")
  const [newChatPhone, setNewChatPhone] = useState("")
  const [newChatStage, setNewChatStage] = useState("")

  const [isCallModalOpen, setIsCallModalOpen] = useState(false)
  const [callStatus, setCallStatus] = useState<"connecting" | "ringing" | "in-progress" | "ended" | "failed">("connecting")
  const [callDuration, setCallDuration] = useState(0)
  const [activeCallId, setActiveCallId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [tabFilter, setTabFilter] = useState<"all" | "open" | "bot" | "assigned">("all")
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [assigningThread, setAssigningThread] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [threadsWithActiveFollowups, setThreadsWithActiveFollowups] = useState<string[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedThreadRef = useRef<Thread | null>(null)
  useEffect(() => {
    selectedThreadRef.current = selectedThread
  }, [selectedThread])

  const threadsRef = useRef<Thread[]>([])
  useEffect(() => {
    threadsRef.current = threads
  }, [threads])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const threadStats = useMemo(() => {
    return {
      total: messages.length,
      bot: messages.filter(m => m.sender_type === "bot").length,
      notes: messages.filter(m => m.metadata?.is_note).length,
      recentNotes: messages.filter(m => m.metadata?.is_note === true).slice(-5).reverse()
    }
  }, [messages])

  // Workspace context — for the new realtime subscription
  const { workspace } = useWorkspace()

  // Track thread ids in state to decide between patch vs hydrate.
  // Ref because handlers need it synchronously (setState updaters fire async).
  const knownThreadIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const next = new Set<string>()
    for (const t of threads) next.add(t.id)
    knownThreadIdsRef.current = next
  }, [threads])

  // Dedupe in-flight hydrates so both conv-INSERT and first-message-INSERT
  // don't both trigger a DB fetch for the same new thread.
  const hydratingThreadIdsRef = useRef<Set<string>>(new Set())

  // Hydrate a thread row with its joined contact — used when realtime events
  // reference a thread we don't have in state yet.
  const hydrateThread = useCallback(async (threadId: string) => {
    if (hydratingThreadIdsRef.current.has(threadId)) return
    hydratingThreadIdsRef.current.add(threadId)
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}`)
      if (!res.ok) return
      const data = await res.json()
      const thread: Thread = data.thread
      if (!thread) return
      setThreads((prev) => {
        if (prev.some((t) => t.id === thread.id)) {
          return prev.map((t) => t.id === thread.id ? { ...t, contacts: t.contacts ?? thread.contacts } : t)
        }
        return [thread, ...prev]
      })
    } finally {
      hydratingThreadIdsRef.current.delete(threadId)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id)
    })
  }, [supabase])

  useEffect(() => {
    const fetchActiveFollowupThreads = async () => {
      if (!workspace?.id) return
      // PERF FIX: scoped to workspace, and NOT triggered by every threads update
      const { data } = await supabase
        .from("messages")
        .select("thread_id")
        .eq("workspace_id", workspace.id)
        .eq("metadata->>is_note", "true")
        .not("metadata->>followup_date", "is", null)
        .not("metadata->>followup_completed", "eq", "true")

      if (data) {
        setThreadsWithActiveFollowups(data.map(m => m.thread_id).filter(Boolean))
      }
    }
    fetchActiveFollowupThreads()
  // PERF FIX: removed `threads` from dep array — was re-fetching on every realtime update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (callStatus === "in-progress") {
      interval = setInterval(() => setCallDuration(d => d + 1), 1000)
    }
    return () => clearInterval(interval)
  }, [callStatus])

  // Realtime subscription for call status in inbox
  useEffect(() => {
    if (!activeCallId) return

    const channel = supabase
      .channel(`dograh-call-inbox-${activeCallId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "voice_calls", filter: `id=eq.${activeCallId}` },
        (payload) => {
          const status = payload.new?.status
          if (status === "ringing") {
            setCallStatus("ringing")
          } else if (status === "connected") {
            setCallStatus("in-progress")
          } else if (status === "terminated" || status === "failed" || status === "missed") {
            setCallStatus("ended")
            setTimeout(() => {
              setIsCallModalOpen(false)
              setActiveCallId(null)
            }, 2000)
          }
        }
      )
      .subscribe()

    return () => {
      // PERF FIX: use removeChannel (v2 API) — unsubscribe() leaves stale socket state
      supabase.removeChannel(channel)
    }
  }, [activeCallId, supabase])

  const fetchThreads = useCallback(async (resetSelection = false, showLoading = false) => {
    if (showLoading || threadsRef.current.length === 0) {
      setLoadingThreads(true)
    }
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (tabFilter === "open") { params.set("status", "open") }
      else if (tabFilter === "bot") { params.set("ai", "true") }
      else if (tabFilter === "assigned") { params.set("assigned", "true") }
      // "all" → no status filter → returns all threads

      if (search) params.set("search", search)
      if (filterStatus && filterStatus !== "all") params.set("filterStatus", filterStatus)
      if (filterAssignedTo && filterAssignedTo !== "all") params.set("filterAssignedTo", filterAssignedTo)
      if (filterTags.length > 0) params.set("tags", filterTags.join(","))
      if (filterFollowups && filterFollowups !== "all") params.set("followups", filterFollowups)
      if (filterDateOption === "custom") {
        if (filterStartDate) params.set("startDate", filterStartDate)
        if (filterEndDate) params.set("endDate", filterEndDate)
      } else if (filterDateOption === "24h") {
        params.set("startDate", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      } else if (filterDateOption === "week") {
        params.set("startDate", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      } else if (filterDateOption === "month") {
        params.set("startDate", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      }

      const res = await fetch(`/api/inbox/threads?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[fetchThreads]", err)
        throw new Error(err.error ?? "Failed to load threads")
      }
      const data = await res.json()
      const list: Thread[] = data.threads ?? []
      setThreads(list)
      const currentSelected = selectedThreadRef.current
      if (resetSelection || !currentSelected) {
        setSelectedThread(list[0] ?? null)
      } else {
        // Re-sync the selected thread data in case status/ai_active changed
        const updated = list.find(t => t.id === currentSelected.id)
        if (updated) setSelectedThread(updated)
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load threads")
    } finally {
      setLoadingThreads(false)
    }
  }, [tabFilter, search, filterStatus, filterAssignedTo, filterTags, filterFollowups, filterDateOption, filterStartDate, filterEndDate])

  const fetchMetaTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const res = await fetch("/api/templates")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMetaTemplates(data)
      if (data.length > 0) setSelectedTemplate(data[0].name)
    } catch {
      toast.error("Failed to load templates")
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleCreateSingleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) return;

    setSending(true);
    try {
      const cleanPhone = newChatPhone.replace(/\D/g, "");
      const formattedPhone = `${newChatCountryCode}${cleanPhone}`;

      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .limit(1)
        .single();

      if (!member) throw new Error("Workspace not found");
      const workspaceId = member.workspace_id;

      let contactId: string;
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("phone", formattedPhone)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const { data: newContact, error: contactErr } = await supabase
          .from("contacts")
          .insert({
            workspace_id: workspaceId,
            full_name: newChatName.trim() || null,
            phone: formattedPhone,
          })
          .select("id")
          .single();
        if (contactErr) throw contactErr;
        contactId = newContact.id;
      }

      let threadId: string;
      const { data: existingThread } = await supabase
        .from("threads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("contact_id", contactId)
        .maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        const { data: newThread, error: threadErr } = await supabase
          .from("threads")
          .insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            channel: "whatsapp",
            status: "open",
            unread_count: 0,
            last_message_at: new Date().toISOString(),
            last_message_preview: "Conversation started",
            ai_active: false,
          })
          .select("id")
          .single();
        if (threadErr) throw threadErr;
        threadId = newThread.id;
      }

      if (newChatStage) {
        const stageNamesMap: Record<string, string> = {
          new: "New Lead",
          contacted: "Contacted",
          qualified: "Qualified",
          proposal: "Proposal Sent",
          won: "Won",
          lost: "Lost",
        };
        const targetStageName = stageNamesMap[newChatStage] || "New Lead";
        const { data: stage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("name", targetStageName)
          .limit(1)
          .single();

        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (!existingLead) {
          const { data: pipeline } = await supabase
            .from("pipelines")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("is_default", true)
            .single();

          await supabase
            .from("leads")
            .insert({
              workspace_id: workspaceId,
              contact_id: contactId,
              pipeline_id: pipeline?.id || null,
              stage_id: stage?.id || null,
              status: newChatStage,
              value: 0,
            });
        }
      }

      toast.success("Chat started successfully");
      setIsNewChatModalOpen(false);
      setNewChatName("");
      setNewChatPhone("");
      setNewChatStage("");
      fetchThreads();
    } catch (err: any) {
      toast.error(err.message || "Failed to start chat");
    } finally {
      setSending(false);
    }
  };

  const handleBulkChatUpload = async (parsedData: any[]) => {
    setSending(true);
    let successCount = 0;
    try {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .limit(1)
        .single();

      if (!member) throw new Error("Workspace not found");
      const workspaceId = member.workspace_id;

      for (const row of parsedData) {
        const phone = row.phone || row.Phone || row.number || row.Number;
        const name = row.name || row.Name || row.full_name || row.FullName;
        if (!phone) continue;

        const cleanPhone = String(phone).replace(/\D/g, "");
        const formattedPhone = cleanPhone.startsWith("91") && cleanPhone.length === 12 ? `+${cleanPhone}` : `+91${cleanPhone}`;

        let contactId: string;
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("phone", formattedPhone)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const { data: newContact } = await supabase
            .from("contacts")
            .insert({
              workspace_id: workspaceId,
              full_name: name ? String(name).trim() : null,
              phone: formattedPhone,
            })
            .select("id")
            .single();
          if (!newContact) continue;
          contactId = newContact.id;
        }

        const { data: existingThread } = await supabase
          .from("threads")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("contact_id", contactId)
          .maybeSingle();

        if (!existingThread) {
          await supabase
            .from("threads")
            .insert({
              workspace_id: workspaceId,
              contact_id: contactId,
              channel: "whatsapp",
              status: "open",
              unread_count: 0,
              last_message_at: new Date().toISOString(),
              last_message_preview: "Conversation imported",
              ai_active: false,
            });
        }
        successCount++;
      }

      toast.success(`Imported ${successCount} chats successfully`);
      setIsNewChatModalOpen(false);
      fetchThreads();
    } catch (err: any) {
      toast.error(err.message || "Bulk upload failed");
    } finally {
      setSending(false);
    }
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > 0) {
          handleBulkChatUpload(results.data);
        } else {
          toast.error("No valid entries found in CSV.");
        }
      }
    });
  };

  const isAnyFilterActive =
    filterStatus !== "all" ||
    filterAssignedTo !== "all" ||
    filterTags.length > 0 ||
    filterFollowups !== "all" ||
    filterDateOption !== "all";

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterAssignedTo("all");
    setFilterTags([]);
    setFilterFollowups("all");
    setFilterDateOption("all");
    setFilterStartDate("");
    setFilterEndDate("");
    toast.success("Filters cleared");
  };

  useEffect(() => {
    if (!selectedThread || !selectedThread.contacts) return;
    const contactId = selectedThread.contacts.id;
    const fetchLeadStatus = async () => {
      const { data } = await supabase
        .from("leads")
        .select("status")
        .eq("contact_id", contactId)
        .maybeSingle();

      if (data) {
        setLeadStatus(data.status);
      } else {
        setLeadStatus(null);
      }
    };
    fetchLeadStatus();
  }, [selectedThread?.id, supabase]);

  const handleUpdateLeadStatus = async (newStatus: string) => {
    if (!selectedThread || !selectedThread.contacts) return;
    const contactId = selectedThread.contacts.id;

    try {
      const { data: contactData } = await supabase
        .from("contacts")
        .select("workspace_id")
        .eq("id", contactId)
        .single();

      if (!contactData) throw new Error("Contact not found");
      const workspaceId = contactData.workspace_id;

      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("contact_id", contactId)
        .maybeSingle();

      const stageNamesMap: Record<string, string> = {
        new: "New Lead",
        contacted: "Contacted",
        qualified: "Qualified",
        proposal: "Proposal Sent",
        won: "Won",
        lost: "Lost",
      };
      const targetStageName = stageNamesMap[newStatus] || "New Lead";
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", targetStageName)
        .limit(1)
        .single();
      const stageId = stage?.id || null;

      if (existingLead) {
        const { error } = await supabase
          .from("leads")
          .update({
            status: newStatus,
            stage_id: stageId,
          })
          .eq("id", existingLead.id);
        if (error) throw error;
      } else {
        const { data: pipeline } = await supabase
          .from("pipelines")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("is_default", true)
          .single();

        const { error } = await supabase
          .from("leads")
          .insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            pipeline_id: pipeline?.id || null,
            stage_id: stageId,
            status: newStatus,
            value: 0,
          });
        if (error) throw error;
      }

      setLeadStatus(newStatus);
      toast.success(`Lead status updated to ${targetStageName}`);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update lead status");
    }
  };

  const markFollowupComplete = async (messageId: string, currentMetadata: any) => {
    try {
      const updatedMetadata = { ...currentMetadata, followup_completed: true };
      const { error } = await supabase
        .from("messages")
        .update({ metadata: updatedMetadata })
        .eq("id", messageId);

      if (error) throw error;

      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, metadata: updatedMetadata } : m));
      toast.success("Followup marked as complete");
    } catch {
      toast.error("Failed to complete followup");
    }
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !noteText.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/inbox/threads/${selectedThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteText.trim(),
          isNote: true,
          followupDate: followupDate || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to add note");

      // PERF FIX: removed double-fetch after POST. The realtime handleMessageInsert
      // callback will append the note automatically. If POST returns the new message,
      // we append it directly — no extra round-trip needed.
      const data = await res.json();
      if (data.message) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message as Message];
        });
      }

      setNoteText("");
      setFollowupDate("");
      setIsAddNoteModalOpen(false);
      toast.success("Note and followup added");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchThreads(false, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchThreads]);
  useEffect(() => {
    fetch("/api/team").then(r => r.json()).then(d => setTeamMembers(d.members ?? [])).catch(() => { })
  }, [])

  useEffect(() => {
    if (!selectedThread) return
    setLoadingMessages(true)
    setActiveTicket(null)

    Promise.all([
      fetch(`/api/inbox/threads/${selectedThread.id}/messages?limit=100`).then(r => r.json()),
      fetch(`/api/inbox/threads/${selectedThread.id}`).then(r => r.json()),
    ]).then(([msgData, threadData]) => {
      setMessages(msgData.messages ?? [])
      setActiveTicket(threadData.activeTicket ?? null)
      // PERF FIX: instant scroll on load (smooth animates unnecessarily on thread switch)
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }))
    }).finally(() => setLoadingMessages(false))
  }, [selectedThread?.id])

  const handleMessageInsert = useCallback((msg: Record<string, any>) => {
    const newMsg = msg as Message
    
    // Only append to active conversation list if it belongs to selected thread
    if (selectedThread && newMsg.thread_id === selectedThread.id) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        
        // Find matching optimistic message by content
        const matchIdx = prev.findIndex(
          (m) => m.id.startsWith("temp-") && m.content === newMsg.content
        );
        if (matchIdx !== -1) {
          return prev.filter((_, idx) => idx !== matchIdx).concat(newMsg);
        }
        return [...prev, newMsg];
      })
      // PERF FIX: rAF instead of setTimeout — synced with paint cycle
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }))
    }

    // Update unread count and preview snippet in the thread sidebar for all threads
    setThreads((prev) =>
      prev.map((t) =>
        t.id === newMsg.thread_id
          ? {
              ...t,
              last_message_preview: newMsg.content ?? t.last_message_preview,
              last_message_at: newMsg.created_at,
              unread_count:
                selectedThread?.id === newMsg.thread_id ? 0 : t.unread_count + 1,
            }
          : t
      )
    )
  }, [selectedThread?.id])

  const handleMessageUpdate = useCallback((msg: Record<string, any>) => {
    const updatedMsg = msg as Message
    if (selectedThread && updatedMsg.thread_id === selectedThread.id) {
      setMessages((prev) => prev.map((m) => m.id === updatedMsg.id ? updatedMsg : m))
    }
  }, [selectedThread?.id])

  const handleThreadInsert = useCallback((thread: Record<string, any>) => {
    const newThread = thread as Thread
    if (!knownThreadIdsRef.current.has(newThread.id)) {
      setThreads((prev) => {
        if (prev.some((t) => t.id === newThread.id)) return prev
        return [newThread, ...prev]
      })
      hydrateThread(newThread.id)
    }
  }, [hydrateThread])

  const handleThreadUpdate = useCallback((thread: Record<string, any>) => {
    const updatedThread = thread as Thread
    if (knownThreadIdsRef.current.has(updatedThread.id)) {
      const isActive = selectedThread?.id === updatedThread.id
      setThreads((prev) =>
        prev.map((t) =>
          t.id === updatedThread.id
            ? { ...t, ...updatedThread, unread_count: isActive ? 0 : updatedThread.unread_count }
            : t
        )
      )
      if (isActive) {
        setSelectedThread((prev) => prev ? { ...prev, ...updatedThread } : prev)
      }
    } else {
      hydrateThread(updatedThread.id)
    }
  }, [selectedThread?.id, hydrateThread])

  const { isConnected, resyncToken } = useInboxRealtime({
    workspaceId: workspace.id,
    onMessageInsert: handleMessageInsert,
    onMessageUpdate: handleMessageUpdate,
    onThreadInsert: handleThreadInsert,
    onThreadUpdate: handleThreadUpdate,
    enabled: true,
  })

  // Re-fetch messages when WS reconnects or tab returns to foreground
  useEffect(() => {
    if (!selectedThread?.id || resyncToken === 0) return
    fetch(`/api/inbox/threads/${selectedThread.id}/messages?limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.messages) setMessages(data.messages)
      })
      .catch(() => {})
  }, [resyncToken, selectedThread?.id])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    const mime = file.type
    let mediaType: "image" | "document" | "audio" | "video" = "document"
    if (mime.startsWith("image/")) mediaType = "image"
    else if (mime.startsWith("audio/") || mime === "application/ogg") mediaType = "audio"
    else if (mime.startsWith("video/")) mediaType = "video"

    const preview = mediaType === "image" ? URL.createObjectURL(file) : undefined
    setPendingMedia({ file, type: mediaType, preview })
    setComposerMode("message")
  }

  function clearPendingMedia() {
    if (pendingMedia?.preview) URL.revokeObjectURL(pendingMedia.preview)
    setPendingMedia(null)
  }

  async function sendMessage(textToSend: string): Promise<boolean> {
    if (!selectedThread) return false
    if (composerMode !== "template" && !textToSend.trim() && !pendingMedia) return false

    const optimisticId = `temp-${Date.now()}`
    const optimisticText = textToSend.trim()
    const isMediaOrTemplate = pendingMedia || composerMode === "template"
    if (isMediaOrTemplate) {
      setSending(true)
    }

    // Optimistic insert — show immediately before API responds
    if (composerMode === "message" && optimisticText && !pendingMedia) {
      const optimisticMsg: Message = {
        id: optimisticId,
        thread_id: selectedThread.id,
        content: optimisticText,
        type: "text",
        sender_type: "agent",
        status: "sending",
        created_at: new Date().toISOString(),
        file_url: null,
        file_name: null,
      }

      setMessages((prev) => [...prev, optimisticMsg])
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }))
    }

    try {
      let mediaId: string | undefined
      let mediaFileName: string | undefined
      let mediaType: string = composerMode === "note" ? "text" : "text"

      if (pendingMedia && composerMode !== "template") {
        setUploadingMedia(true)
        const uploadForm = new FormData()
        uploadForm.append("file", pendingMedia.file, pendingMedia.file.name)
        const uploadRes = await fetch("/api/inbox/upload-media", { method: "POST", body: uploadForm })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed")
        mediaId = uploadData.media_id
        mediaFileName = uploadData.file_name
        mediaType = pendingMedia.type
        setUploadingMedia(false)
      }

      const payload = composerMode === "template"
        ? {
          type: "template",
          templateName: selectedTemplate,
          templateLanguage: metaTemplates.find(t => t.name === selectedTemplate)?.language ?? "en",
          isNote: false
        }
        : {
          content: optimisticText || undefined,
          type: mediaId ? mediaType : "text",
          isNote: composerMode === "note",
          ...(mediaId ? { mediaId, fileName: mediaFileName } : {}),
        };

      const res = await fetch(`/api/inbox/threads/${selectedThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Send failed")

      // Replace optimistic with real message from server
      if (data.message) {
        setMessages((prev) => {
          const withoutOptimistic = prev.filter((m) => m.id !== optimisticId)
          if (withoutOptimistic.some((m) => m.id === data.message.id)) return withoutOptimistic
          return [...withoutOptimistic, data.message as Message]
        })
        requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }))
      }

      clearPendingMedia()
      if (composerMode === "note" || composerMode === "template") {
        setComposerMode("message")
      }
      return true
    } catch (err: any) {
      // Roll back optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      toast.error(err.message)
      return false
    } finally {
      if (isMediaOrTemplate) {
        setSending(false)
      }
      setUploadingMedia(false)
    }
  }


  async function handleAssign(memberId: string | null, action: "assign" | "enable_ai" | "disable_ai" | "close") {
    if (!selectedThread) return
    setAssigningThread(true)
    try {
      const res = await fetch("/api/inbox/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread.id, agentId: memberId, action }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      // PERF FIX: local optimistic update is sufficient — realtime will sync any drift.
      // Removed fetchThreads() here which caused a full round-trip after every action.
      setSelectedThread(prev => prev ? { ...prev, ...data.thread } : null)
      setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, ...data.thread } : t))
      setShowAssignMenu(false)
    } catch { toast.error("Action failed") }
    finally { setAssigningThread(false) }
  }

  async function saveThreadTags(tags: string[]) {
    if (!selectedThread) return
    try {
      const res = await fetch(`/api/inbox/threads/${selectedThread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedThread(prev => prev ? { ...prev, tags: data.thread.tags } : null)
      setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, tags: data.thread.tags } : t))
    } catch { toast.error("Failed to update tags") }
  }

  async function createTicketFromThread() {
    if (!selectedThread || !selectedThread.contacts) return
    setCreatingTicket(true)
    try {
      const lastMsg = messages.findLast(m => m.sender_type === "contact")
      const subject = lastMsg?.content?.slice(0, 120) ?? `Thread from ${selectedThread.contacts.phone}`

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: selectedThread.contacts.id,
          thread_id: selectedThread.id,
          subject,
          source: "manual",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to create ticket")
      toast.success("Ticket created")
      router.push(`/dashboard/tickets/${data.ticket.id}`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCreatingTicket(false)
    }
  }

  const contact = selectedThread?.contacts
  const assignedMember = teamMembers.find(m => m.user_id === selectedThread?.assigned_to)

  // PERF FIX: memoized — was recomputing 4 .filter() calls on every render
  const TAB_COUNTS = useMemo(() => ({
    all: threads.length,
    open: threads.filter(t => !t.ai_active && !t.assigned_to).length,
    bot: threads.filter(t => t.ai_active).length,
    assigned: threads.filter(t => !!t.assigned_to).length,
  }), [threads])

  return (
    <div className="absolute inset-0 flex bg-white dark:bg-zinc-950 overflow-hidden">
      <div className="w-[300px] border-r border-border bg-card flex flex-col shrink-0 relative">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-gray-900">Shared Inbox</h2>
            <button onClick={() => fetchThreads(false, true)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <RefreshCw className={cn("h-4 w-4", loadingThreads && "animate-spin")} />
            </button>
          </div>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
              <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-1.5 bg-gray-100 rounded-lg text-[12px] outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className={cn(
                "p-1.5 rounded-lg border border-border bg-card hover:bg-gray-100 text-gray-500 transition-colors shrink-0 flex items-center justify-center",
                isAnyFilterActive ? "border-primary text-primary bg-primary/5" : ""
              )}
              title="Filter Chats"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 w-full shrink-0">
            {(["all", "open", "bot", "assigned"] as const).map(tab => (
              <button key={tab} onClick={() => setTabFilter(tab)}
                className={cn("px-1 py-1 rounded-md text-[10px] font-semibold transition-all text-center truncate",
                  tabFilter === tab ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-500 hover:text-gray-900"
                )}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {TAB_COUNTS[tab] > 0 && ` (${TAB_COUNTS[tab]})`}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setIsNewChatModalOpen(true)}
          className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-primary hover:bg-primary/95 flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95 z-20"
          title="Start New Chat"
        >
          <Plus className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {loadingThreads ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[12px]">Loading…</span>
            </div>
          ) : threads.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[12px]">No conversations</p>
            </div>
          ) : threads.map(thread => {
            const c = thread.contacts
            const isSelected = selectedThread?.id === thread.id
            return (
              <button key={thread.id} onClick={() => {
                setSelectedThread(thread)
                setComposerMode("message")
                setPendingMedia(null)
              }}
                className={cn("w-full flex items-start gap-2.5 p-3 text-left hover:bg-gray-100/40 transition-colors",
                  isSelected ? "bg-primary/5 border-l-2 border-primary" : "border-l-2 border-transparent"
                )}>
                <div className="shrink-0 pt-0.5">
                  {c ? <Avatar name={c.full_name} phone={c.phone} avatarUrl={c.avatar_url} size={36} /> : <div className="w-9 h-9 rounded-full bg-gray-100" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[13px] font-semibold text-gray-900 truncate">
                      {c?.full_name ?? c?.phone ?? "Unknown"}
                    </span>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {thread.last_message_at ? formatRelativeTime(thread.last_message_at) : ""}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{thread.last_message_preview ?? "No messages"}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selectedThread ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {contact && <Avatar name={contact.full_name} phone={contact.phone} avatarUrl={contact.avatar_url} size={36} />}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-gray-900 truncate">
                    {contact?.full_name ?? contact?.phone ?? "Unknown"}
                  </p>
                  {activeTicket && (
                    <button
                      onClick={() => router.push(`/dashboard/tickets/${activeTicket.id}`)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors shrink-0">
                      <Ticket className="h-3 w-3" />
                      TKT-{activeTicket.ref.toString(16).toUpperCase().padStart(8, "0")}
                    </button>
                  )}
                  {threadsWithActiveFollowups.includes(selectedThread.id) && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-bold border border-blue-200 shrink-0">
                      <Calendar className="h-2.5 w-2.5" /> Follow-up
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">{contact?.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsSmartCardsCollapsed(!isSmartCardsCollapsed)}
                className="p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 rounded-lg transition-colors border border-border shadow-sm flex items-center justify-center bg-card"
                title={isSmartCardsCollapsed ? "Expand Details" : "Collapse Details"}
              >
                {isSmartCardsCollapsed ? (
                  <PanelRightOpen className="h-4 w-4" />
                ) : (
                  <PanelRightClose className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Chat + Detail panel row */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Messages area */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white dark:bg-zinc-900">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" /><span className="text-[12px]">Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-500 text-[13px]">No messages yet</div>
                ) : (
                  messages.map(m => <MessageBubble key={m.id} msg={m} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 24h window indicator */}
              {messages.length > 0 && (() => {
                const w = get24HourWindowStatus(messages)
                return (
                  <div className={cn("flex items-center gap-2 px-4 py-1.5 text-[10px] font-semibold border-t",
                    w.active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full inline-block", w.active ? "bg-emerald-500" : "bg-red-500")} />
                    {w.active ? `Free reply window: ${w.text}` : "Window expired – template required"}
                  </div>
                )
              })()}

              {/* Composer */}
              <div className="border-t border-border p-3 bg-card shrink-0">
                {/* Composer mode tabs */}
                <div className="flex gap-1 mb-2">
                  <button onClick={() => { setComposerMode("message"); setPendingMedia(null) }}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors",
                      composerMode === "message" ? "bg-primary/10 text-primary" : "text-gray-500 hover:text-gray-900"
                    )}>
                    <MessageSquare className="h-3 w-3" /> Message
                  </button>
                  <button onClick={() => { setComposerMode("note"); setPendingMedia(null) }}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors",
                      composerMode === "note" ? "bg-amber-100 text-amber-700" : "text-gray-500 hover:text-gray-900"
                    )}>
                    <StickyNote className="h-3 w-3" /> Note
                  </button>
                  <button onClick={() => { setComposerMode("template"); setPendingMedia(null); fetchMetaTemplates() }}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors",
                      composerMode === "template" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:text-gray-900"
                    )}>
                    <FileText className="h-3 w-3" /> Template
                  </button>
                  <div className="flex-1" />
                  {/* Media attach */}
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={onFileChange} />
                  <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors" title="Attach media">
                    <Paperclip className="h-4 w-4" />
                  </button>
                </div>

                {/* Template selector */}
                {composerMode === "template" && (
                  <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    {loadingTemplates ? (
                      <div className="flex items-center gap-2 text-xs text-blue-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading templates...</div>
                    ) : metaTemplates.length === 0 ? (
                      <p className="text-xs text-blue-700 font-medium">No approved templates found. Configure templates in the AI Settings page.</p>
                    ) : (
                      <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="w-full text-xs p-1.5 rounded-lg bg-white border border-blue-200">
                        {metaTemplates.map(t => <option key={t.name} value={t.name}>{t.display_name} ({t.language})</option>)}
                      </select>
                    )}
                  </div>
                )}

                {/* Pending media preview */}
                {pendingMedia && (
                  <div className="mb-2 p-2 bg-gray-50 rounded-xl border border-border flex items-center gap-2">
                    {pendingMedia.type === "image" && pendingMedia.preview && (
                      <img src={pendingMedia.preview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
                    )}
                    {pendingMedia.type !== "image" && <FileText className="h-8 w-8 text-gray-500" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate">{pendingMedia.file.name}</p>
                      <p className="text-[10px] text-gray-500 capitalize">{pendingMedia.type}</p>
                    </div>
                    <button onClick={clearPendingMedia} className="text-gray-500 hover:text-gray-900"><X className="h-4 w-4" /></button>
                  </div>
                )}

                <ComposerInput
                  composerMode={composerMode}
                  pendingMedia={pendingMedia}
                  sending={sending}
                  uploadingMedia={uploadingMedia}
                  onSend={sendMessage}
                  threadId={selectedThread.id}
                />
              </div>
            </div>

            {/* ── Smart Cards Panel ─────────────────────────────────────── */}
            {!isSmartCardsCollapsed && (
              <div className="w-[272px] shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto pb-20">

                {/* Panel header */}
                <div className="px-4 py-3 border-b border-border shrink-0">
                  <p className="text-[13px] font-bold text-gray-900">Smart Cards</p>
                </div>

                {/* Contact card */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-3 mb-3">
                    {contact && <Avatar name={contact.full_name} phone={contact.phone} avatarUrl={contact.avatar_url} size={40} />}
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 truncate">{contact?.full_name ?? "Unknown"}</p>
                      <p className="text-[11px] text-gray-500 truncate">{contact?.phone}</p>
                    </div>
                  </div>
                  {/* Removed Message / Call action buttons */}
                </div>

                {/* Active Ticket */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-bold text-gray-900">Active Ticket</p>
                    {activeTicket && (
                      <button onClick={() => router.push(`/dashboard/tickets/${activeTicket.id}`)} className="text-[10px] text-primary font-semibold hover:opacity-70 flex items-center gap-0.5">
                        View <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {activeTicket ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-[11px] font-bold text-amber-800 mb-1">
                        TKT-{activeTicket.ref.toString(16).toUpperCase().padStart(8, "0")}
                      </p>
                      <p className="text-[12px] font-semibold text-gray-900 mb-2 leading-snug">{activeTicket.subject}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold", STATUS_COLOR[activeTicket.status] ?? "bg-gray-100 text-gray-900")}>
                          {activeTicket.status}
                        </span>
                        <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold", SEVERITY_COLOR[activeTicket.severity] ?? "bg-gray-100 text-gray-900")}>
                          {activeTicket.severity}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={createTicketFromThread}
                      disabled={creatingTicket}
                      className="w-full py-2 text-[11px] font-semibold border border-dashed border-border rounded-xl hover:bg-gray-100 transition-colors text-gray-500 flex items-center justify-center gap-1.5">
                      {creatingTicket ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
                      Create Ticket
                    </button>
                  )}
                </div>

                {/* AI Auto-Reply */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BotIcon className="h-4 w-4 text-gray-500" />
                      <p className="text-[12px] font-bold text-gray-900">AI Auto-Reply</p>
                    </div>
                    {/* Toggle */}
                    <Toggle
                        checked={selectedThread.ai_active}
                        onChange={(newActive) => {
                          setSelectedThread(prev => prev ? { ...prev, ai_active: newActive } : null);
                          setThreads(prev => prev.map(t => t.id === selectedThread.id ? { ...t, ai_active: newActive } : t));
                          handleAssign(null, newActive ? "enable_ai" : "disable_ai");
                        }}
                      />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 ml-6">
                    {selectedThread.ai_active ? "AI is handling replies." : "Human agent in control."}
                  </p>
                </div>

                {/* Assigned To */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-3.5 w-3.5 text-gray-500" />
                    <p className="text-[12px] font-bold text-gray-900">Assigned To</p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowAssignMenu(p => !p)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border bg-white hover:bg-gray-100 transition-colors text-[12px] font-semibold text-gray-900">
                      <span className={cn(!assignedMember && "text-gray-500 font-normal")}>
                        {assignedMember?.full_name ?? assignedMember?.email ?? "Unassigned"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                    {showAssignMenu && (
                      <div className="absolute left-0 top-full mt-1 w-full bg-white border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                        <button onClick={() => handleAssign(null, "assign")} className="w-full text-left px-3 py-2 text-[12px] hover:bg-gray-100 text-gray-500">
                          Unassigned
                        </button>
                        {teamMembers.map(m => (
                          <button key={m.id} onClick={() => handleAssign(m.user_id, "assign")}
                            className="w-full text-left px-3 py-2 text-[12px] hover:bg-gray-100 flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                              {(m.full_name || m.email || "?").charAt(0).toUpperCase()}
                            </div>
                            {m.full_name || m.email}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-gray-500" />
                      <p className="text-[12px] font-bold text-gray-900">Tags</p>
                    </div>
                    <button onClick={() => setEditingTags(p => !p)} className="text-[10px] text-primary font-semibold hover:opacity-70">
                      {editingTags ? "Done" : "Edit"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(selectedThread.tags ?? []).map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-gray-900 dark:text-primary rounded-full text-[10px] font-semibold">
                        {tag}
                        {editingTags && (
                          <button onClick={() => {
                            const newTags = (selectedThread.tags ?? []).filter((_, idx) => idx !== i)
                            saveThreadTags(newTags)
                          }} className="hover:text-red-500 ml-0.5"><X className="h-2.5 w-2.5" /></button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && tagInput.trim()) {
                          e.preventDefault()
                          const newTags = [...(selectedThread.tags ?? []), tagInput.trim().toLowerCase()]
                          saveThreadTags(newTags)
                          setTagInput("")
                        }
                      }}
                      placeholder="+ Add tag"
                      className="flex-1 text-[11px] text-gray-500 placeholder:text-gray-500/60 bg-transparent outline-none"
                    />
                    {tagInput.trim() && (
                      <button
                        onClick={() => {
                          const newTags = [...(selectedThread.tags ?? []), tagInput.trim().toLowerCase()]
                          saveThreadTags(newTags)
                          setTagInput("")
                        }}
                        className="text-[10px] text-primary font-bold hover:opacity-70">
                        Add
                      </button>
                    )}
                  </div>
                </div>

                {/* Lead Stage */}
                <div className="p-4 border-b border-border">
                  <p className="text-[12px] font-bold text-gray-900 mb-2">Lead Stage</p>
                  <select
                    value={leadStatus ?? ""}
                    onChange={e => handleUpdateLeadStatus(e.target.value)}
                    className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary font-semibold cursor-pointer">
                    <option value="">Not a Lead</option>
                    <option value="new">New Lead</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal Sent</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                {/* Thread Info */}
                <div className="p-4 border-b border-border">
                  <p className="text-[12px] font-bold text-gray-900 mb-3">Thread Info</p>
                  <div className="space-y-2">
                    {[
                      { label: "Messages", value: threadStats.total },
                      { label: "Bot replies", value: threadStats.bot },
                      { label: "Notes", value: threadStats.notes },
                      { label: "Status", value: selectedThread.status.charAt(0).toUpperCase() + selectedThread.status.slice(1) },
                      { label: "Priority", value: (selectedThread.priority ?? "normal").charAt(0).toUpperCase() + (selectedThread.priority ?? "normal").slice(1) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-[12px]">
                        <span className="text-gray-500">{label}</span>
                        <span className="font-semibold text-gray-900">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes & Follow-ups */}
                <div className="p-4 flex-1">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] font-bold text-gray-900">Notes & Follow-ups</p>
                    <button
                      onClick={() => { setNoteText(""); setFollowupDate(""); setIsAddNoteModalOpen(true) }}
                      className="text-[10px] text-primary font-semibold hover:opacity-70 flex items-center gap-0.5">
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {threadStats.recentNotes.map(m => (
                        <div key={m.id} className={cn(
                          "p-2 rounded-lg border text-[10px]",
                          m.metadata?.followup_completed
                            ? "bg-gray-100/20 border-border/40 opacity-60"
                            : "bg-amber-50 border-amber-200"
                        )}>
                          <p className="font-medium text-gray-900 line-clamp-3 leading-relaxed mb-1">{m.content}</p>
                          {m.metadata?.followup_date && (
                            <div className="flex items-center justify-between">
                              <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1", m.metadata?.followup_completed ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700")}>
                                <Calendar className="h-2.5 w-2.5 shrink-0" />
                                {new Date(m.metadata.followup_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {m.metadata?.followup_completed ? " ✓" : ""}
                              </span>
                              {!m.metadata?.followup_completed && (
                                <button
                                  onClick={() => markFollowupComplete(m.id, m.metadata)}
                                  className="text-[9px] text-emerald-600 hover:opacity-70 font-semibold">
                                  Mark done
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    }
                    {threadStats.notes === 0 && (
                      <p className="text-[11px] text-gray-500">No notes yet</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">Select a conversation</div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

      {/* Advanced Filter Chats Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[540px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-[16px] font-bold text-gray-900">Filter Chats</h2>
              <button onClick={() => setIsFilterModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex border-b text-[12px] bg-gray-100/20">
              {[
                { id: "status", label: "Chat Status" },
                { id: "assigned", label: "Assigned To" },
                { id: "tags", label: "Tags & Attributes" },
                { id: "followups", label: "Follow-ups" },
                { id: "date", label: "Date" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterActiveTab(t.id as any)}
                  className={cn(
                    "flex-grow py-3 text-center font-bold border-b-2 transition-all",
                    filterActiveTab === t.id
                      ? "border-primary text-primary bg-white"
                      : "border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/10"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Filter Content */}
            <div className="p-5 min-h-[180px] bg-white text-[12px]">
              {filterActiveTab === "status" && (
                <div className="space-y-3">
                  <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px]">Select Chat Status</span>
                  <div className="flex gap-2">
                    {["all", "open", "closed"].map(st => (
                      <button
                        key={st}
                        onClick={() => setFilterStatus(st)}
                        className={cn(
                          "flex-1 py-2 px-3 border rounded-xl font-semibold capitalize transition-all",
                          filterStatus === st ? "border-primary text-primary bg-primary/5 font-bold" : "border-border hover:bg-gray-100"
                        )}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterActiveTab === "assigned" && (
                <div className="space-y-3">
                  <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px]">Assignment Options</span>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { id: "all", label: "All Chats" },
                      { id: "my", label: "My Chats" },
                      { id: "others", label: "Other's" },
                      { id: "unassigned", label: "Unassigned" },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setFilterAssignedTo(opt.id)}
                        className={cn(
                          "py-2 px-1 border rounded-xl font-semibold transition-all text-center text-[11px]",
                          filterAssignedTo === opt.id ? "border-primary text-primary bg-primary/5 font-bold" : "border-border hover:bg-gray-100"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterActiveTab === "tags" && (
                <div className="space-y-4">
                  <div>
                    <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px] mb-2">Filter by tag name</span>
                    <input
                      type="text"
                      placeholder="Enter tags comma-separated (e.g. lead, real_estate)"
                      onChange={e => {
                        const val = e.target.value.trim();
                        if (val) {
                          setFilterTags(val.split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
                        } else {
                          setFilterTags([]);
                        }
                      }}
                      defaultValue={filterTags.join(", ")}
                      className="w-full border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-gray-100/10 font-medium"
                    />
                  </div>
                </div>
              )}

              {filterActiveTab === "followups" && (
                <div className="space-y-3">
                  <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px]">Filter by Follow-ups status</span>
                  <div className="flex gap-2">
                    {[
                      { id: "all", label: "All Chats" },
                      { id: "has_followup", label: "Has Active Follow-up" },
                      { id: "no_followup", label: "No Active Follow-up" },
                    ].map(fl => (
                      <button
                        key={fl.id}
                        onClick={() => setFilterFollowups(fl.id)}
                        className={cn(
                          "flex-grow py-2 px-3 border rounded-xl font-semibold transition-all text-center",
                          filterFollowups === fl.id ? "border-primary text-primary bg-primary/5 font-bold" : "border-border hover:bg-gray-100"
                        )}
                      >
                        {fl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterActiveTab === "date" && (
                <div className="space-y-4">
                  <div>
                    <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px] mb-2">Quick Selections</span>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: "all", label: "All Time" },
                        { id: "24h", label: "Last 24 Hours" },
                        { id: "week", label: "This Week" },
                        { id: "month", label: "This Month" },
                      ].map(dq => (
                        <button
                          key={dq.id}
                          type="button"
                          onClick={() => setFilterDateOption(dq.id)}
                          className={cn(
                            "py-2 px-1 text-center border rounded-xl font-semibold transition-all",
                            filterDateOption === dq.id ? "border-primary text-primary bg-primary/5 font-bold" : "border-border hover:bg-gray-100"
                          )}
                        >
                          {dq.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-dashed border-border my-2" />
                  <div>
                    <span className="font-semibold block text-gray-500 uppercase tracking-wider text-[10px] mb-2">Custom Date Range</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Start Date</label>
                        <input
                          type="date"
                          value={filterStartDate}
                          onChange={e => { setFilterStartDate(e.target.value); setFilterDateOption("custom"); }}
                          className="w-full border border-border rounded-xl p-2 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">End Date</label>
                        <input
                          type="date"
                          value={filterEndDate}
                          onChange={e => { setFilterEndDate(e.target.value); setFilterDateOption("custom"); }}
                          className="w-full border border-border rounded-xl p-2 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-border flex justify-end gap-2 bg-gray-100/10">
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-gray-100 transition-colors text-gray-500 bg-white"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-[460px] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-[16px] font-bold text-gray-900">Start New Chat</h2>
              <button onClick={() => setIsNewChatModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-border text-[12px] bg-gray-100/20">
              <button
                type="button"
                onClick={() => setNewChatTab("single")}
                className={cn("flex-1 py-2.5 text-center font-bold border-b-2 transition-all",
                  newChatTab === "single" ? "border-primary text-primary bg-white" : "border-transparent text-gray-500 hover:bg-gray-100/10"
                )}
              >
                Single Chat
              </button>
              <button
                type="button"
                onClick={() => setNewChatTab("bulk")}
                className={cn("flex-1 py-2.5 text-center font-bold border-b-2 transition-all",
                  newChatTab === "bulk" ? "border-primary text-primary bg-white" : "border-transparent text-gray-500 hover:bg-gray-100/10"
                )}
              >
                Bulk Import
              </button>
            </div>

            <div className="p-5 text-[12px] bg-white">
              {newChatTab === "single" ? (
                <form onSubmit={handleCreateSingleChat} className="space-y-4">
                  <div>
                    <label className="block font-bold text-gray-500 uppercase text-[10px] mb-1">Contact Name</label>
                    <input
                      type="text"
                      required
                      value={newChatName}
                      onChange={e => setNewChatName(e.target.value)}
                      placeholder="Enter contact name"
                      className="w-full border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-gray-100/10 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-500 uppercase text-[10px] mb-1">WhatsApp Number *</label>
                    <div className="flex gap-2">
                      <select
                        value={newChatCountryCode}
                        onChange={e => setNewChatCountryCode(e.target.value)}
                        className="border border-border rounded-xl px-2 py-2 bg-white outline-none font-semibold text-xs cursor-pointer"
                      >
                        <option value="+91">🇮🇳 +91 (IN)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                        <option value="+44">🇬🇧 +44 (UK)</option>
                        <option value="+971">🇦🇪 +971 (UAE)</option>
                      </select>
                      <input
                        type="text"
                        required
                        value={newChatPhone}
                        onChange={e => setNewChatPhone(e.target.value)}
                        placeholder="9876543210"
                        className="flex-1 border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-gray-100/10 font-semibold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-gray-500 uppercase text-[10px] mb-1">Kanban Stage (Optional)</label>
                    <select
                      value={newChatStage}
                      onChange={e => setNewChatStage(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2 text-xs bg-white outline-none cursor-pointer font-semibold"
                    >
                      <option value="">Do Not Add to Leads</option>
                      <option value="new">New Lead</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="proposal">Proposal Sent</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 border-t border-border mt-4">
                    <button type="button" onClick={() => setIsNewChatModalOpen(false)} className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-gray-100 bg-white text-gray-500">Cancel</button>
                    <button type="submit" disabled={sending} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:bg-primary/95 transition-colors shadow-sm">
                      {sending ? "Creating..." : "Create Chat"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-primary hover:bg-primary/5 transition-all">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleBulkFileChange}
                      className="hidden"
                      id="bulk-chat-file"
                    />
                    <label htmlFor="bulk-chat-file" className="cursor-pointer space-y-2 block">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                        <Upload className="h-5 w-5" />
                      </div>
                      <span className="block font-semibold text-gray-900 text-xs">Choose CSV File</span>
                      <span className="block text-[10px] text-gray-500 mt-1">File must contain headers: 'phone' (required) and 'name' (optional)</span>
                    </label>
                  </div>

                  <div className="pt-2 flex justify-end gap-2 border-t border-border mt-4">
                    <button type="button" onClick={() => setIsNewChatModalOpen(false)} className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-gray-100 bg-white text-gray-500">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Note & Followup Modal */}
      {isAddNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white w-[400px] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold">Add Note & Followup</h2>
              <button onClick={() => setIsAddNoteModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-full"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleAddNoteSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Note Content *</label>
                <textarea
                  required
                  rows={4}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="he is interested in whatsapp automation..."
                  className="w-full border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 bg-gray-100/20 resize-none font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Followup (Optional)</label>
                <DatePicker
                  selected={followupDate ? new Date(followupDate) : null}
                  onChange={(date: Date | null) => setFollowupDate(date ? date.toISOString() : "")}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={15}
                  dateFormat="MMMM d, yyyy h:mm aa"
                  className="w-full border border-border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white cursor-pointer shadow-sm transition-all hover:border-primary/50"
                  placeholderText="Select date and time"
                  isClearable
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-border mt-4">
                <button type="button" onClick={() => setIsAddNoteModalOpen(false)} className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-gray-50 bg-white">Cancel</button>
                <button type="submit" disabled={sending} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
                  {sending ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beautiful Call Modal */}
      {isCallModalOpen && selectedThread?.contacts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-[#1C1C1E] w-[340px] rounded-[36px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/10 flex flex-col items-center py-12 px-6 relative">

            {/* Top Right close button - only if failed or ended */}
            {(callStatus === "ended" || callStatus === "failed") && (
              <button
                onClick={() => setIsCallModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Avatar with pulse effect if connecting/ringing */}
            <div className="relative mb-6">
              {(callStatus === "connecting" || callStatus === "ringing") && (
                <>
                  <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
                  <div className="absolute inset-[-15px] rounded-full bg-emerald-500/20 animate-pulse" />
                </>
              )}
              <div className="relative z-10 w-28 h-28 rounded-full border-4 border-[#2C2C2E] overflow-hidden bg-gray-100">
                {selectedThread.contacts.avatar_url ? (
                  <img src={selectedThread.contacts.avatar_url} alt="Contact" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-4xl font-bold">
                    {getInitials(selectedThread.contacts.full_name, selectedThread.contacts.phone)}
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white text-center mb-1">
              {selectedThread.contacts.full_name || selectedThread.contacts.phone}
            </h2>

            <p className="text-[13px] text-white/60 font-medium mb-12 flex items-center gap-2">
              {callStatus === "connecting" && <><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</>}
              {callStatus === "ringing" && "Ringing..."}
              {callStatus === "in-progress" && (
                <span className="text-emerald-400 font-mono tracking-wider">
                  {Math.floor(callDuration / 60).toString().padStart(2, "0")}:
                  {(callDuration % 60).toString().padStart(2, "0")}
                </span>
              )}
              {callStatus === "ended" && "Call Ended"}
              {callStatus === "failed" && <span className="text-red-400">Call Failed</span>}
            </p>

            <div className="flex items-center gap-6 mt-4">
              <button
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  callStatus === "in-progress" ? "bg-white/10 hover:bg-white/20 text-white" : "opacity-30 cursor-not-allowed bg-white/5 text-white/50"
                )}
              >
                <div className="w-5 h-5 rounded-sm border-2 border-current grid grid-cols-2 gap-0.5 p-0.5">
                  <div className="bg-current rounded-sm"></div><div className="bg-current rounded-sm"></div>
                  <div className="bg-current rounded-sm"></div><div className="bg-current rounded-sm"></div>
                </div>
              </button>

              <button
                onClick={async () => {
                  setCallStatus("ended")
                  if (activeCallId) {
                    await fetch(`/api/whatsapp/calls/${activeCallId}`, { method: "DELETE" }).catch(() => {});
                  }
                  setTimeout(() => {
                    setIsCallModalOpen(false)
                    setActiveCallId(null)
                  }, 2000)
                }}
                disabled={callStatus === "ended" || callStatus === "failed"}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-transform active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                <Phone className="h-6 w-6 rotate-[135deg]" />
              </button>

              <button
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
                  callStatus === "in-progress" ? "bg-white/10 hover:bg-white/20 text-white" : "opacity-30 cursor-not-allowed bg-white/5 text-white/50"
                )}
              >
                <BotIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
