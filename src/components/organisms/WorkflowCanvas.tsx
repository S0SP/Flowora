"use client"

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react"
import {
 ReactFlow,
 Background,
 Controls,
 MiniMap,
 Handle,
 Position,
 Connection,
 useReactFlow,
 BaseEdge,
 EdgeLabelRenderer,
 getBezierPath,
 MarkerType,
 BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
 Database, MessageSquare, Clock, Mail, Phone, Bell,
 Calendar, CheckCircle2, AlertCircle, FileSpreadsheet,
 Globe, SplitSquareHorizontal, Zap, Loader2, ArrowRight,
 UserPlus, X, GitBranch, BrainCircuit, ChevronRight, Settings
} from "lucide-react"
import { cn } from "@/lib/utils"

// Types 
export type NodeBranch = { id: string; label: string; type: "true" | "false" | "button" | "fallback" | "custom" }

// Icon + Style Maps 
const TYPE_CONFIG: Record<string, {
 icon: React.ElementType
 accentColor: string
}> = {
 google_sheet: { icon: Database, accentColor: "var(--node-sheets)" },
 webhook: { icon: Globe, accentColor: "var(--node-webhook)" },
 form: { icon: MessageSquare, accentColor: "var(--node-form)" },
 whatsapp: { icon: MessageSquare, accentColor: "var(--node-whatsapp)" },
 email: { icon: Mail, accentColor: "var(--node-email)" },
 voice: { icon: Phone, accentColor: "var(--node-voice)" },
 update_crm: { icon: Database, accentColor: "var(--node-sheets)" },
 crm: { icon: Database, accentColor: "var(--node-sheets)" },
 delay: { icon: Clock, accentColor: "var(--node-delay)" },
 condition: { icon: GitBranch, accentColor: "var(--node-condition)" },
 reminder: { icon: Bell, accentColor: "var(--node-reminder)" },
 trigger: { icon: Zap, accentColor: "var(--node-default)" },
}

function getTypeConfig(typeKey: string) {
 return TYPE_CONFIG[typeKey] ?? TYPE_CONFIG["trigger"]
}

// Custom Animated Edge 
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, label, data, selected }: any) {
 const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
 const branchType = data?.branchType

 const baseColor = selected ? "var(--text-primary)" : "var(--node-border)"
 const edgeColor = selected && branchType === "true" ? "var(--node-whatsapp)" : 
                   selected && branchType === "false" ? "var(--node-condition)" : 
                   selected && branchType === "button" ? "var(--node-email)" : 
                   baseColor

 return (
 <>
 <BaseEdge id={id} path={edgePath} style={{ ...style, stroke: edgeColor, strokeWidth: 2 }} markerEnd={markerEnd} />
 {label && (
 <EdgeLabelRenderer>
 <div
 style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
 className="nodrag nopan"
 >
 <span style={{
 backgroundColor: "var(--node-bg)",
 color: branchType === "true" ? "var(--node-whatsapp)" : branchType === "false" ? "var(--node-condition)" : branchType === "button" ? "var(--node-email)" : "var(--text-secondary)",
 borderColor: "var(--node-border)",
 }} className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] border shadow-sm">
 {label}
 </span>
 </div>
 </EdgeLabelRenderer>
 )}
 </>
 )
}

// Helper: Build default fields for preview 
function buildPreviewFields(typeKey: string, data: any): { label: string; value: string; ok?: boolean }[] {
 switch (typeKey) {
 case "google_sheet":
 return [
 { label: "Sheet", value: data.sheetUrl ? " Connected" : " URL Required", ok: !!data.sheetUrl },
 { label: "Phone Col", value: data.phoneColumn || "phone" },
 ]
 case "whatsapp":
 return [
 { label: "Template", value: data.templateName || " Not Set", ok: !!data.templateName },
 { label: "To", value: data.toPhone || "{{phone}}" },
 ]
 case "email":
 return [
 { label: "Subject", value: data.subject || " Required", ok: !!data.subject },
 { label: "To", value: data.toEmail || "{{email}}" },
 ]
 case "voice":
 return [
 { label: "Voice", value: data.voiceId || "anushka" },
 { label: "Agent", value: data.agentType || "livekit" },
 ]
 case "delay": {
 const d = data.delayDays ? `${data.delayDays}d` : ""
 const h = data.delayHours ? `${data.delayHours}h` : ""
 const m = data.delayMinutes ? `${data.delayMinutes}m` : ""
 return [{ label: "Wait", value: [d, h, m].filter(Boolean).join(" ") || "1d" }]
 }
 case "condition":
 return [
 { label: "If", value: data.field ? `${data.field} ${data.operator ?? "=="} ${data.value ?? "?"}` : " Not Configured", ok: !!data.field },
 ]
 case "update_crm": case "crm":
 return [{ label: "Stage", value: data.stage || "new_lead" }]
 case "reminder":
 return [{ label: "Event", value: data.eventDate ? "Set" : " Required", ok: !!data.eventDate }]
 case "webhook":
 return [{ label: "Method", value: data.method || "POST" }, { label: "Payload", value: "Auto" }]
 case "form":
 return [{ label: "Form", value: data.formId || "All Forms" }]
 default:
 return data.fields ?? [{ label: "Status", value: "Configured" }]
 }
}

// WhatsApp Preview bubble 
function WhatsAppBubble({ text, buttons }: { text: string; buttons?: NodeBranch[] }) {
 const preview = text?.replace(/\{\{([^}]+)\}\}/g, (_, p) => `[${p.split(".").pop()?.toUpperCase() ?? p}]`) || "Message preview…"
 return (
 <div style={{ backgroundColor: "var(--canvas-bg)", borderColor: "var(--node-border)" }} className="rounded-md p-1.5 mt-1 border">
 <div style={{ backgroundColor: "var(--node-bg)", color: "var(--text-primary)" }} className="rounded-[4px_4px_4px_0] px-2 py-1.5 text-[9px] leading-relaxed shadow-sm">
 {preview}
 </div>
 {buttons && buttons.filter(b => b.type === "button").map((b, i) => (
 <div key={i} style={{ backgroundColor: "var(--node-bg)", color: "var(--node-whatsapp)", borderColor: "var(--node-border)" }} className="mt-1 rounded-[4px] px-2 py-1 text-[9px] font-semibold text-center border">
 {b.label}
 </div>
 ))}
 </div>
 )
}

// Condition Branch Handles 
function ConditionHandles({ branches }: { branches: NodeBranch[] }) {
 return (
 <>
 {branches.map((branch, index) => {
 const pct = ((index + 0.5) / branches.length) * 100
 const color = branch.type === "true" ? "var(--node-whatsapp)" : branch.type === "false" ? "var(--node-condition)" : branch.type === "fallback" ? "var(--text-secondary)" : "var(--node-email)"
 return (
 <div key={branch.id}>
 <Handle
 type="source"
 position={Position.Right}
 id={branch.id}
 style={{ top: `${pct}%`, background: color, width: 8, height: 8, right: -4, border: "2px solid var(--node-bg)", borderRadius: 4 }}
 />
 </div>
 )
 })}
 </>
 )
}

// MAIN CUSTOM NODE 
const CustomNode = React.memo(({ id, data, selected }: { id: string; data: any; selected: boolean }) => {
 const { deleteElements } = useReactFlow()
 const typeKey = data.subtype ?? data.type ?? data.id ?? "trigger"
 const cfg = getTypeConfig(typeKey)
 const Icon = cfg.icon
 const title = data.label ?? data.title ?? "Node"
 const isConfigured = !buildPreviewFields(typeKey, data).some(f => f.value?.startsWith(""))
 const branches: NodeBranch[] = data.branches ?? (typeKey === "condition" ? [
 { id: "true", label: "True ", type: "true" },
 { id: "false", label: "False ", type: "false" }
 ] : [])
 const isTrigger = ["google_sheet", "webhook", "form", "trigger"].includes(typeKey)
 const isCondition = typeKey === "condition"
 const isWhatsApp = typeKey === "whatsapp"
 const hasBranches = branches.length > 0

 const previewFields = buildPreviewFields(typeKey, data)

 return (
 <div
 onClick={() => data.onClick?.(id)}
 className={cn(
 "group relative cursor-pointer transition-all duration-150 select-none",
 "rounded-[6px] border",
 selected ? "ring-1 ring-offset-0" : "hover:shadow-md"
 )}
 style={{ 
 backgroundColor: "var(--node-bg)", 
 borderColor: selected ? "var(--text-primary)" : "var(--node-border)", 
 boxShadow: selected ? "var(--node-shadow)" : "none",
 width: isWhatsApp && data.branches?.length ? 220 : 200, 
 borderTop: `3px solid ${cfg.accentColor}` 
 }}
 >
 {/* Target Handle */}
 {!isTrigger && (
 <Handle
 type="target"
 position={Position.Left}
 id="input"
 style={{ background: "var(--node-bg)", border: `2px solid ${cfg.accentColor}`, width: 8, height: 8, left: -4, borderRadius: 4 }}
 />
 )}

 {/* Header */}
 <div className="px-2.5 py-2 flex items-center justify-between border-b" style={{ borderColor: "var(--node-border)" }}>
 <div className="flex items-center gap-2 overflow-hidden">
 <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.accentColor }} />
 <span className="text-[11px] font-bold truncate leading-tight" style={{ color: "var(--text-primary)" }}>{title}</span>
 </div>
 <div className="flex items-center gap-1.5 shrink-0 pl-2">
 {isTrigger && (
 <span className="text-[8px] px-1.5 py-0.5 rounded-[4px] font-bold tracking-wide uppercase" style={{ backgroundColor: "var(--canvas-bg)", color: "var(--text-secondary)" }}>Trigger</span>
 )}
 {!isConfigured && (
 <AlertCircle className="h-3.5 w-3.5 text-red-500" />
 )}
 <Settings className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-tertiary)" }} />
 </div>
 </div>

 {/* Body */}
 <div className="px-2.5 py-2 space-y-1">
 {/* WhatsApp live preview */}
 {isWhatsApp && (data.message || data.previewText) && (
 <WhatsAppBubble
 text={data.message ?? data.previewText ?? ""}
 buttons={branches.filter(b => b.type === "button")}
 />
 )}

 {/* Standard fields */}
 {(!isWhatsApp || (!data.message && !data.previewText)) && previewFields.map((field, i) => (
 <div key={i} className="flex items-center justify-between gap-2 py-0.5">
 <span className="text-[10px] shrink-0 font-medium" style={{ color: "var(--text-secondary)" }}>{field.label}</span>
 <span className="text-[10px] font-semibold truncate max-w-[120px] text-right" style={{ color: field.value?.startsWith("") ? "var(--node-delay)" : "var(--text-primary)" }}>
 {field.value}
 </span>
 </div>
 ))}

 {/* Condition branches list */}
 {isCondition && (
 <div className="mt-2 space-y-1">
 {branches.map((b, i) => (
 <div key={b.id} className="flex items-center justify-between px-1.5 py-1 rounded-[4px] border text-[9px] font-semibold" style={{ backgroundColor: "var(--canvas-bg)", borderColor: "var(--node-border)", color: "var(--text-primary)" }}>
 <span>{b.label}</span>
 <ChevronRight className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
 </div>
 ))}
 </div>
 )}

 {/* WhatsApp button branches */}
 {isWhatsApp && branches.length > 0 && (
 <div className="mt-2 space-y-1">
 {branches.map(b => (
 <div key={b.id} className="flex items-center justify-between px-1.5 py-1 rounded-[4px] border text-[9px] font-semibold" style={{ backgroundColor: "var(--canvas-bg)", borderColor: "var(--node-border)", color: "var(--text-primary)" }}>
 <span>{b.label}</span>
 <ChevronRight className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
 </div>
 ))}
 </div>
 )}
 </div>

 {/* Source handles */}
 {hasBranches ? (
 <ConditionHandles branches={branches} />
 ) : !["update_crm", "crm"].includes(typeKey) ? (
 <Handle
 type="source"
 position={Position.Right}
 id="output"
 style={{ background: "var(--node-bg)", border: `2px solid ${cfg.accentColor}`, width: 8, height: 8, right: -4, borderRadius: 4 }}
 />
 ) : null}

 {/* Delete Button */}
 {selected && (
 <button
 onClick={(e) => {
 e.stopPropagation()
 deleteElements({ nodes: [{ id }] })
 }}
 className="absolute -top-3 -right-3 z-20 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors border-2 border-white"
 title="Delete node"
 >
 <X className="h-3 w-3" />
 </button>
 )}
 </div>
 )
})

CustomNode.displayName = "CustomNode"

// Node type registry 
const nodeTypes = {
 customNode: CustomNode,
 trigger: CustomNode,
 whatsapp: CustomNode,
 delay: CustomNode,
 email: CustomNode,
 update_crm: CustomNode,
 crm: CustomNode,
 reminder: CustomNode,
 voice: CustomNode,
 condition: CustomNode,
 webhook: CustomNode,
 form: CustomNode,
}

const edgeTypes = { flowEdge: FlowEdge }

// Initial nodes / edges 
export const initialNodes: any[] = [
 {
 id: "trigger-init",
 type: "customNode",
 position: { x: 60, y: 180 },
 data: {
 type: "trigger", subtype: "google_sheet",
 label: "Google Sheet Trigger",
 badge: "Trigger",
 sheetUrl: "", phoneColumn: "phone", nameColumn: "name",
 }
 },
 {
 id: "wa-init",
 type: "customNode",
 position: { x: 360, y: 100 },
 data: {
 type: "whatsapp",
 label: "WhatsApp Message",
 toPhone: "{{phone}}",
 templateName: "",
 message: "",
 branches: [],
 }
 },
 {
 id: "delay-init",
 type: "customNode",
 position: { x: 360, y: 280 },
 data: {
 type: "delay",
 label: "Wait 1 Day",
 delayDays: 1, delayHours: 0, delayMinutes: 0,
 }
 },
 {
 id: "voice-init",
 type: "customNode",
 position: { x: 660, y: 180 },
 data: {
 type: "voice",
 label: "AI Voice Call",
 voiceId: "anushka",
 agentType: "livekit",
 systemPrompt: "",
 }
 },
]

export const initialEdges: any[] = [
 { id: "e-t-wa", source: "trigger-init", target: "wa-init", type: "flowEdge", animated: true, style: { stroke: "#22c55e" } },
 { id: "e-t-d", source: "trigger-init", target: "delay-init", type: "flowEdge", style: { stroke: "#94a3b8" } },
 { id: "e-d-v", source: "delay-init", target: "voice-init", type: "flowEdge", animated: true, style: { stroke: "#9333ea" } },
]

// Drag type → node data map 
function buildDroppedNodeData(typeId: string, setActiveRightPanel: (id: string) => void): any {
 const base = { type: typeId, onClick: setActiveRightPanel }
 switch (typeId) {
 case "google_sheet": return { ...base, subtype: "google_sheet", label: "Google Sheet Trigger", sheetUrl: "", phoneColumn: "phone" }
 case "webhook": return { ...base, subtype: "webhook", label: "Webhook Trigger", method: "POST" }
 case "form": return { ...base, subtype: "form", label: "Form Submission", formId: "" }
 case "whatsapp": return { ...base, label: "WhatsApp Message", toPhone: "{{phone}}", templateName: "", message: "", branches: [] }
 case "email": return { ...base, label: "Email", toEmail: "{{email}}", subject: "", html: "" }
 case "voice": return { ...base, label: "AI Voice Call", voiceId: "anushka", agentType: "livekit", systemPrompt: "" }
 case "delay": return { ...base, label: "Wait", delayDays: 1, delayHours: 0, delayMinutes: 0 }
 case "condition": return {
 ...base, label: "Condition",
 field: "", operator: "equals", value: "",
 branches: [
 { id: "true", label: "True ", type: "true" },
 { id: "false", label: "False ", type: "false" },
 { id: "fallback", label: "Fallback (else)", type: "fallback" },
 ]
 }
 case "reminder": return { ...base, label: "Reminder", eventDate: "", reminders: [] }
 case "crm": return { ...base, label: "Update CRM", stage: "new_lead" }
 default: return { ...base, label: typeId }
 }
}

// Canvas Component 
export function WorkflowCanvas({
 nodes, edges, onNodesChange, onEdgesChange, onConnect,
 setNodes, setActiveRightPanel
}: {
 nodes: any[], edges: any[],
 onNodesChange: any, onEdgesChange: any, onConnect: any,
 setNodes: any,
 setActiveRightPanel: (id: string) => void
}) {
 const { screenToFlowPosition, deleteElements } = useReactFlow()

 const onDragOver = useCallback((e: React.DragEvent) => {
 e.preventDefault()
 e.dataTransfer.dropEffect = "move"
 }, [])

 const onDrop = useCallback((e: React.DragEvent) => {
 e.preventDefault()
 const typeId = e.dataTransfer.getData("application/reactflow")
 if (!typeId) return
 const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
 const id = `${typeId}-${Date.now()}`
 const newNode: any = {
 id,
 type: "customNode",
 position,
 data: {
 ...buildDroppedNodeData(typeId, setActiveRightPanel),
 onClick: setActiveRightPanel,
 }
 }
 setNodes((nds: any[]) => nds.concat(newNode))
 setTimeout(() => setActiveRightPanel(id), 50)
 }, [screenToFlowPosition, setNodes, setActiveRightPanel])

 const nodesWithClick = useMemo(() => nodes.map(n => ({
 ...n,
 data: { ...n.data, onClick: setActiveRightPanel }
 })), [nodes, setActiveRightPanel])

 return (
 <div className="w-full h-full">
 <ReactFlow
 onEdgeClick={(_, edge) => {
 if (confirm("Delete this connection?")) {
 deleteElements({ edges: [{ id: edge.id }] })
 }
 }}
 nodes={nodesWithClick}
 edges={edges}
 onNodesChange={onNodesChange}
 onEdgesChange={onEdgesChange}
 onConnect={(params: Connection) => {
 const sourceNode = nodes.find(n => n.id === params.source)
 const branchId = params.sourceHandle
 const branch = sourceNode?.data?.branches?.find((b: NodeBranch) => b.id === branchId)
 const edgeLabel = branch?.label
 const branchType = branch?.type
 onConnect({
 ...params,
 type: "flowEdge",
 animated: branchType === "true" || branchType === "button",
 label: edgeLabel,
 data: { branchType },
 style: {
 stroke: branchType === "true" ? "#22c55e" : branchType === "false" ? "#ef4444" : branchType === "fallback" ? "#94a3b8" : "#3b82f6"
 },
 markerEnd: { type: MarkerType.ArrowClosed }
 })
 }}
 onDrop={onDrop}
 onDragOver={onDragOver}
 nodeTypes={nodeTypes}
 edgeTypes={edgeTypes}
 fitView
 fitViewOptions={{ padding: 0.2 }}
 deleteKeyCode="Delete"
 proOptions={{ hideAttribution: true }}
 className="bg-[var(--canvas-bg)]"
 defaultEdgeOptions={{ type: "flowEdge", markerEnd: { type: MarkerType.ArrowClosed } }}
 >
 <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--node-border)" />
 <Controls
  className="!shadow-md !rounded-xl overflow-hidden"
  style={{ backgroundColor: "var(--panel-bg)", borderColor: "var(--node-border)" }}
  showInteractive={false}
  />
  <MiniMap
  className="!shadow-md !rounded-xl"
  style={{ backgroundColor: "var(--panel-bg)", borderColor: "var(--node-border)" }}
  nodeColor={(n) => {
  const t = n.data?.subtype ?? n.data?.type ?? ""
  return (TYPE_CONFIG as any)[t as string]?.accentColor ?? "var(--node-border)"
  }}
 maskColor="rgba(250,250,249,0.85)"
 pannable zoomable
 />
 </ReactFlow>
 </div>
 )
}