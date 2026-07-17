"use client"

import React, { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MoreHorizontal, Phone, Mail, FileText, CheckCircle2, MessageSquare, Zap, Mic, Plus, GripVertical, Calendar, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/atoms/Avatar"
import { Badge } from "@/components/atoms/Badge"
import { Lead } from "@/app/dashboard/leads/page"

type LeadCard = {
  id: string
  name: string
  source?: string
  phone?: string
  time?: string
  tags?: string[]
  type: "standard" | "simple" | "contacted" | "value" | "demo" | "value_time" | "converted"
  value?: string
  date?: string
  voice?: boolean
  custom_fields?: Record<string, any>
  latest_note?: string | null
  followup_date?: string | null
  followup_completed?: boolean
}

type ColumnData = {
  id: string
  title: string
  colorClass: string
  badgeBg: string
}

const initialColumns: ColumnData[] = [
  { id: "new", title: "New Lead", colorClass: "border-chart-2/40", badgeBg: "bg-chart-2/20 text-gray-900" },
  { id: "contacted", title: "Contacted", colorClass: "border-primary/50", badgeBg: "bg-primary/20 text-gray-900" },
  { id: "qualified", title: "Qualified", colorClass: "border-chart-4/50", badgeBg: "bg-chart-4/20 text-gray-900" },
  { id: "proposal", title: "Proposal", colorClass: "border-lavender/50", badgeBg: "bg-lavender/20 text-gray-900" },
  { id: "won", title: "Won", colorClass: "border-chart-5/50", badgeBg: "bg-chart-5/20 text-gray-900" },
  { id: "lost", title: "Lost", colorClass: "border-chart-3/50", badgeBg: "bg-chart-3/20 text-gray-900" },
]

const dotColors: Record<string, string> = {
  new: "bg-teal-600",
  contacted: "bg-blue-600",
  qualified: "bg-amber-600",
  proposal: "bg-indigo-600",
  won: "bg-emerald-600",
  lost: "bg-red-600",
}

function SortableItem({ id, item, onEdit }: { id: string; item: LeadCard, onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCardComponent item={item} onEdit={onEdit} />
    </div>
  )
}

function LeadCardComponent({ item, onEdit }: { item: LeadCard, onEdit: () => void }) {
  return (
    <div className="bg-white border border-border/60 rounded-lg p-2.5 shadow-sm hover:shadow transition-all duration-200 cursor-grab active:cursor-grabbing group relative select-none">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0 pr-4">
          {item.type !== "simple" && item.type !== "value" && item.type !== "value_time" && item.type !== "converted" && (
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarFallback className="text-[8px] font-bold">{item.name.substring(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <h4 className="font-semibold text-xs text-gray-900 truncate leading-snug">{item.name}</h4>
            {item.source && (
              <p className="text-[9px] text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                {item.source === "Google Sheet" ? <FileText className="h-2.5 w-2.5 text-chart-4" /> : null} {item.source}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <GripVertical className="h-3.5 w-3.5 text-gray-500/0 group-hover:text-gray-500/30 transition-colors" />
          <button onPointerDown={(e) => { e.stopPropagation(); onEdit() }} className="text-gray-500 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.type === "converted" ? <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {item.phone && <p className="text-[10px] text-gray-500 mb-1.5 flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> {item.phone}</p>}

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {item.tags.map((tag, idx) => (
            <Badge key={idx} className="bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 font-semibold px-1.5 py-0 min-h-[16px] text-[11px] rounded-[4px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {item.custom_fields && Object.keys(item.custom_fields).length > 0 && (
        <div className="space-y-0.5 mb-2">
          {Object.entries(item.custom_fields).map(([key, val]) => (
            <div key={key} className="bg-gray-100/30 rounded px-1.5 py-0.5 text-[9px] flex justify-between">
              <span className="text-gray-500 font-semibold uppercase">{key}</span>
              <span className="font-semibold text-gray-900">{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      {item.latest_note && (
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-md p-1.5 mb-2 text-[10px] text-gray-500">
          <span className="font-bold block text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-0.5">Latest Note</span>
          <p className="line-clamp-2 italic leading-tight">"{item.latest_note}"</p>
          {item.followup_date && (
            <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 ${item.followup_completed ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              <Calendar className="h-2.5 w-2.5" /> {new Date(item.followup_date).toLocaleDateString()} {item.followup_completed ? <Check className="h-2.5 w-2.5" /> : ""}
            </span>
          )}
        </div>
      )}

      {item.date && (
        <div className="bg-gray-50 rounded p-1 mb-2 flex flex-col gap-0.5 text-[10px]">
          <span className="font-medium flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> {item.date}</span>
          {item.voice && (
            <div className="flex items-center gap-1 text-[9px] text-primary font-medium">
              <Mic className="h-2.5 w-2.5" /> Voice call done
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-gray-500 border-t border-border/40 pt-1.5 mt-1.5">
        {item.time && <span className="text-[9px]">{item.time}</span>}
        {item.value && <span className="text-[11px] font-bold text-gray-900">{item.value}</span>}
        
        {item.type === "standard" && (
          <div className="flex gap-1.5 text-gray-500/50">
            <MessageSquare className="h-3 w-3" />
            <Mail className="h-3 w-3" />
          </div>
        )}
        
        {item.type === "contacted" && !item.time && (
          <div className="flex items-center gap-2 text-[9px] font-medium text-gray-500/60 w-full justify-between">
            <div className="flex items-center gap-1" title="Sent"><MessageSquare className="h-2.5 w-2.5" /> 3</div>
            <div className="flex items-center gap-1" title="Read"><CheckCircle2 className="h-2.5 w-2.5" /> 3</div>
            <div className="flex items-center gap-1" title="Replied"><Zap className="h-2.5 w-2.5" /> 2</div>
          </div>
        )}
      </div>
    </div>
  )
}

function SortableColumn({ col, items, onOpenAdd, onEditLead }: { col: ColumnData; items: LeadCard[], onOpenAdd: (status: string) => void, onEditLead: (id: string) => void }) {
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging } = useSortable({ id: col.id })
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: col.id,
    data: {
      type: "Column",
      col,
    },
  })

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={(node) => { setSortableRef(node); setDroppableRef(node); }} style={style} className="flex flex-col h-full bg-gray-100/20 border border-border/40 rounded-xl p-3 min-h-[500px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.01)] transition-colors">
      <div className="flex items-center justify-between mb-3 pb-1 cursor-grab active:cursor-grabbing shrink-0" {...attributes} {...listeners}>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotColors[col.id] || "bg-gray-100-foreground")} />
          <h3 className="font-semibold text-[13px] text-gray-900/90">{col.title}</h3>
        </div>
        <Badge className="bg-gray-100 text-gray-500 border-none font-semibold px-1.5 py-0 h-4 text-[10px] rounded hover:bg-gray-100/80">{items.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pb-4 min-h-[150px] flex flex-col">
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id} item={item} onEdit={() => onEditLead(item.id)} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex-grow border border-dashed border-border/65 rounded-lg p-6 flex flex-col items-center justify-center text-center bg-gray-100/5 min-h-[120px] transition-colors select-none">
            <span className="text-[10px] font-medium text-gray-500/60">No leads in stage</span>
          </div>
        )}
        <button onClick={() => onOpenAdd(col.id)} className="w-full py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-transparent transition-colors mt-2 shrink-0">
          <Plus className="h-3.5 w-3.5" /> Add Lead
        </button>
      </div>
    </div>
  )
}

const emptyLeads: any[] = []

export function KanbanBoard({ onOpenAdd, onEditLead, filterQuery = "" }: { onOpenAdd: (status: string) => void, onEditLead: (id: string) => void, filterQuery?: string }) {
  const queryClient = useQueryClient()
  const { data: leads = emptyLeads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      return data.leads ?? []
    }
  })

  const [items, setItems] = useState<Record<string, LeadCard[]>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [columns, setColumns] = useState<ColumnData[]>(initialColumns)

  // Load column order from local storage
  useEffect(() => {
    const savedOrder = localStorage.getItem("kanban-column-order")
    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder) as string[]
        const sorted = [...initialColumns].sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id))
        setColumns(sorted)
      } catch {}
    }
  }, [])

  // Map db leads to UI columns
  useEffect(() => {
    const newItems: Record<string, LeadCard[]> = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      won: [],
      lost: []
    }
    leads.forEach((lead: any) => {
      if (filterQuery) {
        const q = filterQuery.toLowerCase().trim();
        const nameMatch = lead.name?.toLowerCase().includes(q);
        const companyMatch = lead.company?.toLowerCase().includes(q);
        if (!nameMatch && !companyMatch) return;
      }
      if (newItems[lead.status]) {
        newItems[lead.status].push({
          id: lead.id,
          name: lead.name,
          source: lead.company,
          value: lead.value && !isNaN(Number(String(lead.value).replace(/[^0-9.-]+/g, "")))
            ? (String(lead.value).startsWith("$") ? lead.value : `$${Number(String(lead.value).replace(/[^0-9.-]+/g, "")).toLocaleString()}`) 
            : "—",
          type: lead.status === "won" ? "converted" : "standard",
          phone: lead.phone,
          tags: lead.tags,
          custom_fields: lead.custom_fields,
          latest_note: lead.latest_note,
          followup_date: lead.followup_date,
          followup_completed: lead.followup_completed,
        })
      }
    })
    setItems(newItems)
  }, [leads, filterQuery])

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: Lead["status"] }) => {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error("Failed to update status")
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] })
    }
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const findContainer = (id: string) => {
    if (id in items) {
      return id
    }
    return Object.keys(items).find((key) => items[key].map(i => i.id).includes(id))
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // If dragging a column, do not run card sorting/moving logic
    if (columns.some(c => c.id === activeId)) {
      return
    }

    const activeContainer = findContainer(activeId)
    const overContainer = findContainer(overId)

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return
    }

    setItems((prev) => {
      const activeItems = prev[activeContainer]
      const overItems = prev[overContainer]
      
      const activeIndex = activeItems.findIndex((i) => i.id === activeId)
      const overIndex = overId in prev ? overItems.length + 1 : overItems.findIndex((i) => i.id === overId)

      return {
        ...prev,
        [activeContainer]: [
          ...prev[activeContainer].filter((item) => item.id !== activeId)
        ],
        [overContainer]: [
          ...prev[overContainer].slice(0, overIndex),
          activeItems[activeIndex],
          ...prev[overContainer].slice(overIndex, prev[overContainer].length)
        ]
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) {
      setActiveId(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string

    // If dragging a column
    if (columns.some(c => c.id === activeId)) {
      const isColOver = columns.some(c => c.id === overId)
      const targetColumnId = isColOver ? overId : findContainer(overId)
      
      if (targetColumnId && activeId !== targetColumnId) {
        setColumns((cols) => {
          const oldIndex = cols.findIndex((c) => c.id === activeId)
          const newIndex = cols.findIndex((c) => c.id === targetColumnId)
          const newCols = arrayMove(cols, oldIndex, newIndex)
          localStorage.setItem("kanban-column-order", JSON.stringify(newCols.map(c => c.id)))
          return newCols
        })
      }
      setActiveId(null)
      return
    }

    const activeContainer = findContainer(activeId)
    // When dropping onto a column header/container directly, overId may be the column id
    const overContainer = findContainer(overId) ?? (columns.some(c => c.id === overId) ? overId : undefined)

    if (!activeContainer || !overContainer) {
      setActiveId(null)
      return
    }

    if (activeContainer !== overContainer) {
      // Changed column, trigger mutation to persist in DB
      updateLeadMutation.mutate({ id: activeId, status: overContainer as Lead["status"] })
    } else {
      const activeIndex = items[activeContainer].findIndex((i) => i.id === activeId)
      const overIndex = items[overContainer].findIndex((i) => i.id === overId)

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        setItems((items) => ({
          ...items,
          [overContainer]: arrayMove(items[overContainer], activeIndex, overIndex),
        }))
      }
    }

    setActiveId(null)
  }

  const activeItem = activeId
    ? Object.values(items).flat().find((i) => i.id === activeId)
    : null

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-gray-500 p-8">Loading leads...</div>
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 w-full p-6 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 w-full h-full min-h-0">
          <SortableContext items={columns.map(c => c.id)}>
            {columns.map((col) => (
              <SortableColumn key={col.id} col={col} items={items[col.id] || []} onOpenAdd={onOpenAdd} onEditLead={onEditLead} />
            ))}
          </SortableContext>
        </div>
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="opacity-90 transform rotate-2">
            <LeadCardComponent item={activeItem} onEdit={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
