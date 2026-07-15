/**
 * Pre-made workflow templates for Flowora.
 */

import type { Node, Edge } from "@xyflow/react"
import { Droplet, Bell, FileSpreadsheet, Megaphone, BrainCircuit } from "lucide-react"

export interface WorkflowTemplate {
  id:                     string
  name:                   string
  description:            string
  category:               "drip" | "reminder" | "automation" | "ads" | "conditional"
  icon:                   React.ElementType
  color:                  string
  bgColor:                string
  tags:                   string[]
  estimatedSetupMinutes:  number
  nodes:                  any[]
  edges:                  any[]
  configFields:           TemplateConfigField[]
}

export interface TemplateConfigField {
  nodeId:      string
  fieldKey:    string
  label:       string
  type:        "text" | "url" | "select" | "textarea" | "number" | "template_picker"
  placeholder?: string
  required:    boolean
  options?:    string[]
  helperText?: string
}

// ── Template 1: WhatsApp Drip Campaign ───────────────────────────────────────
const DRIP_TEMPLATE: WorkflowTemplate = {
  id:                    "drip_whatsapp",
  name:                  "WhatsApp Drip Campaign",
  description:           "Send automated WhatsApp follow-ups over days to nurture leads from Google Sheets.",
  category:              "drip",
  icon:                  Droplet,
  color:                 "text-blue-600",
  bgColor:               "bg-blue-50",
  tags:                  ["WhatsApp", "Drip", "Lead Nurture", "Google Sheets"],
  estimatedSetupMinutes: 5,
  nodes: [
    {
      id: "trigger-1", type: "customNode",
      position: { x: 80, y: 250 },
      data: { type: "trigger", subtype: "google_sheet", label: "Google Sheet Trigger", sheetUrl: "", phoneColumn: "phone", nameColumn: "name" }
    },
    {
      id: "wa-1", type: "customNode",
      position: { x: 380, y: 150 },
      data: { type: "whatsapp", label: "Day 1 — Welcome", toPhone: "{{phone}}", templateName: "", templateLanguage: "en", branches: [] }
    },
    {
      id: "delay-1", type: "customNode",
      position: { x: 380, y: 330 },
      data: { type: "delay", label: "Wait 1 Day", delayDays: 1, delayHours: 0, delayMinutes: 0 }
    },
    {
      id: "wa-2", type: "customNode",
      position: { x: 680, y: 150 },
      data: { type: "whatsapp", label: "Day 2 — Follow-up", toPhone: "{{phone}}", templateName: "", templateLanguage: "en", branches: [] }
    },
    {
      id: "delay-2", type: "customNode",
      position: { x: 680, y: 330 },
      data: { type: "delay", label: "Wait 2 Days", delayDays: 2, delayHours: 0, delayMinutes: 0 }
    },
    {
      id: "wa-3", type: "customNode",
      position: { x: 980, y: 150 },
      data: { type: "whatsapp", label: "Day 4 — Final Offer", toPhone: "{{phone}}", templateName: "", templateLanguage: "en", branches: [] }
    },
    {
      id: "crm-1", type: "customNode",
      position: { x: 980, y: 330 },
      data: { type: "update_crm", label: "Update CRM", stage: "contacted" }
    },
  ],
  edges: [
    { id: "e1", source: "trigger-1", target: "wa-1",    sourceHandle: "output", type: "flowEdge", animated: true,  style: { stroke: "#22c55e" } },
    { id: "e2", source: "wa-1",      target: "delay-1", sourceHandle: "output", type: "flowEdge" },
    { id: "e3", source: "delay-1",   target: "wa-2",    sourceHandle: "output", type: "flowEdge", animated: true },
    { id: "e4", source: "wa-2",      target: "delay-2", sourceHandle: "output", type: "flowEdge" },
    { id: "e5", source: "delay-2",   target: "wa-3",    sourceHandle: "output", type: "flowEdge", animated: true },
    { id: "e6", source: "wa-3",      target: "crm-1",   sourceHandle: "output", type: "flowEdge" },
  ],
  configFields: [
    { nodeId: "trigger-1", fieldKey: "sheetUrl",     label: "Google Sheet URL",      type: "url",             required: true  },
    { nodeId: "wa-1",      fieldKey: "templateName", label: "Day 1 Template",         type: "template_picker", required: true  },
    { nodeId: "wa-2",      fieldKey: "templateName", label: "Day 2 Template",         type: "template_picker", required: true  },
    { nodeId: "wa-3",      fieldKey: "templateName", label: "Day 4 Template",         type: "template_picker", required: true  },
  ],
}

// ── Template 2: Event Reminder ────────────────────────────────────────────────
const REMINDER_TEMPLATE: WorkflowTemplate = {
  id:                    "reminder_automation",
  name:                  "Event Reminder Automation",
  description:           "Send confirmation + timed WhatsApp reminders at 3 days, 1 day, and 1 hour before event.",
  category:              "reminder",
  icon:                  Bell,
  color:                 "text-amber-600",
  bgColor:               "bg-amber-50",
  tags:                  ["Reminder", "Webinar", "Appointment", "WhatsApp"],
  estimatedSetupMinutes: 5,
  nodes: [
    {
      id: "trigger-1", type: "customNode",
      position: { x: 80, y: 250 },
      data: { type: "trigger", subtype: "google_sheet", label: "Sheet — New Registrant", sheetUrl: "", phoneColumn: "phone" }
    },
    {
      id: "wa-confirm", type: "customNode",
      position: { x: 380, y: 250 },
      data: { type: "whatsapp", label: "Instant Confirmation", toPhone: "{{phone}}", templateName: "", branches: [] }
    },
    {
      id: "reminder-node", type: "customNode",
      position: { x: 680, y: 250 },
      data: {
        type: "reminder", label: "Event Reminders",
        eventDate: "",
        reminders: [
          { when: "3d", template: "" },
          { when: "1d", template: "" },
          { when: "1h", template: "" },
        ]
      }
    },
  ],
  edges: [
    { id: "e1", source: "trigger-1",   target: "wa-confirm",    sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#22c55e" } },
    { id: "e2", source: "wa-confirm",  target: "reminder-node", sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#f59e0b" } },
  ],
  configFields: [
    { nodeId: "trigger-1",    fieldKey: "sheetUrl",     label: "Registrant Sheet URL",    type: "url",             required: true  },
    { nodeId: "wa-confirm",   fieldKey: "templateName", label: "Confirmation Template",    type: "template_picker", required: true  },
    { nodeId: "reminder-node",fieldKey: "eventDate",    label: "Event Date & Time (ISO)",  type: "text",            required: true  },
  ],
}

// ── Template 3: Google Sheets → WhatsApp + Email ──────────────────────────────
const SHEETS_FORMS_TEMPLATE: WorkflowTemplate = {
  id:                    "sheets_forms_whatsapp",
  name:                  "Google Sheets & Forms Automation",
  description:           "When someone submits a form or is added to a sheet, send WhatsApp + Email automatically.",
  category:              "automation",
  icon:                  FileSpreadsheet,
  color:                 "text-green-600",
  bgColor:               "bg-green-50",
  tags:                  ["Google Sheets", "Forms", "WhatsApp", "Email"],
  estimatedSetupMinutes: 3,
  nodes: [
    {
      id: "trigger-1", type: "customNode",
      position: { x: 80, y: 250 },
      data: { type: "trigger", subtype: "google_sheet", label: "Google Sheet / Form", sheetUrl: "", phoneColumn: "phone", nameColumn: "name", emailColumn: "email" }
    },
    {
      id: "wa-1", type: "customNode",
      position: { x: 400, y: 150 },
      data: { type: "whatsapp", label: "Send WhatsApp", toPhone: "{{phone}}", templateName: "", branches: [] }
    },
    {
      id: "email-1", type: "customNode",
      position: { x: 400, y: 370 },
      data: { type: "email", label: "Send Confirmation Email", toEmail: "{{email}}", subject: "Thank you for submitting!", html: "<p>Hi {{name}},</p><p>We've received your submission. We'll be in touch soon!</p>" }
    },
    {
      id: "crm-1", type: "customNode",
      position: { x: 720, y: 250 },
      data: { type: "update_crm", label: "Add to CRM", stage: "new_lead" }
    },
  ],
  edges: [
    { id: "e1", source: "trigger-1", target: "wa-1",    sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#22c55e" } },
    { id: "e2", source: "trigger-1", target: "email-1", sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#3b82f6" } },
    { id: "e3", source: "wa-1",      target: "crm-1",   sourceHandle: "output", type: "flowEdge" },
    { id: "e4", source: "email-1",   target: "crm-1",   sourceHandle: "output", type: "flowEdge" },
  ],
  configFields: [
    { nodeId: "trigger-1", fieldKey: "sheetUrl",     label: "Sheet URL",         type: "url",             required: true },
    { nodeId: "wa-1",      fieldKey: "templateName", label: "WhatsApp Template",  type: "template_picker", required: true },
    { nodeId: "email-1",   fieldKey: "subject",      label: "Email Subject",      type: "text",            required: true },
  ],
}

// ── Template 4: Meta Lead Ads → WhatsApp + Voice ──────────────────────────────
const META_ADS_TEMPLATE: WorkflowTemplate = {
  id:                    "meta_lead_ads",
  name:                  "Meta Lead Ads → WhatsApp + Voice",
  description:           "Instant outreach when someone submits a Facebook/Instagram lead form. WhatsApp + AI voice call within seconds.",
  category:              "ads",
  icon:                  Megaphone,
  color:                 "text-blue-700",
  bgColor:               "bg-blue-50",
  tags:                  ["Meta Ads", "Facebook", "Instagram", "Lead Gen", "WhatsApp"],
  estimatedSetupMinutes: 10,
  nodes: [
    {
      id: "trigger-1", type: "customNode",
      position: { x: 80, y: 250 },
      data: { type: "trigger", subtype: "webhook", label: "Meta Lead Form Webhook" }
    },
    {
      id: "wa-instant", type: "customNode",
      position: { x: 380, y: 150 },
      data: { type: "whatsapp", label: "Instant WhatsApp Outreach", toPhone: "{{phone}}", templateName: "", branches: [] }
    },
    {
      id: "voice-1", type: "customNode",
      position: { x: 380, y: 370 },
      data: { type: "voice", label: "AI Voice Call", toPhone: "{{phone}}", agentType: "livekit", voiceId: "anushka", systemPrompt: "You are a sales agent calling about the lead's Facebook ad inquiry. Be warm and professional." }
    },
    {
      id: "crm-1", type: "customNode",
      position: { x: 680, y: 150 },
      data: { type: "update_crm", label: "Add Lead to CRM", stage: "new_lead" }
    },
    {
      id: "delay-1", type: "customNode",
      position: { x: 680, y: 370 },
      data: { type: "delay", label: "Wait 24h", delayDays: 1, delayHours: 0, delayMinutes: 0 }
    },
    {
      id: "wa-followup", type: "customNode",
      position: { x: 980, y: 250 },
      data: { type: "whatsapp", label: "Day 2 Follow-up", toPhone: "{{phone}}", templateName: "", branches: [] }
    },
  ],
  edges: [
    { id: "e1", source: "trigger-1", target: "wa-instant",  sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#22c55e" } },
    { id: "e2", source: "trigger-1", target: "voice-1",     sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#9333ea" } },
    { id: "e3", source: "trigger-1", target: "crm-1",       sourceHandle: "output", type: "flowEdge" },
    { id: "e4", source: "voice-1",   target: "delay-1",     sourceHandle: "output", type: "flowEdge" },
    { id: "e5", source: "delay-1",   target: "wa-followup", sourceHandle: "output", type: "flowEdge", animated: true },
  ],
  configFields: [
    { nodeId: "wa-instant",  fieldKey: "templateName", label: "Instant Reply Template", type: "template_picker", required: true  },
    { nodeId: "voice-1",     fieldKey: "voiceId",      label: "AI Voice",               type: "select",          required: false },
  ],
}

// ── Template 5: Conditional Lead Qualifier ────────────────────────────────────
const CONDITIONAL_QUALIFIER_TEMPLATE: WorkflowTemplate = {
  id:                    "conditional_qualifier",
  name:                  "Smart Lead Qualifier (If/Else)",
  description:           "Qualify leads from a Google Sheet using If/Else logic. Hot leads get an instant voice call. Cold leads get a WhatsApp nurture sequence.",
  category:              "conditional",
  icon:                  BrainCircuit,
  color:                 "text-rose-600",
  bgColor:               "bg-rose-50",
  tags:                  ["Condition", "Lead Qualify", "If/Else", "Voice", "WhatsApp"],
  estimatedSetupMinutes: 8,
  nodes: [
    {
      id: "trigger-1", type: "customNode",
      position: { x: 60, y: 280 },
      data: {
        type: "trigger", subtype: "google_sheet",
        label: "Google Sheet Trigger",
        sheetUrl: "", phoneColumn: "phone", nameColumn: "name",
      }
    },
    {
      id: "crm-entry", type: "customNode",
      position: { x: 340, y: 280 },
      data: { type: "update_crm", label: "Add to CRM", stage: "new_lead" }
    },
    {
      id: "condition-1", type: "customNode",
      position: { x: 620, y: 280 },
      data: {
        type: "condition",
        label: "Is Hot Lead?",
        field: "score",
        operator: "gt",
        value: "7",
        branches: [
          { id: "true",     label: "Hot Lead (score > 7)",  type: "true"     },
          { id: "false",    label: "Cold Lead (score ≤ 7)", type: "false"    },
          { id: "fallback", label: "No score — nurture",    type: "fallback" },
        ]
      }
    },
    // True branch → Voice Call
    {
      id: "voice-hot", type: "customNode",
      position: { x: 960, y: 100 },
      data: {
        type: "voice", label: "AI Voice Call — Hot Lead",
        toPhone: "{{phone}}", agentType: "livekit", voiceId: "sophia",
        systemPrompt: "You are calling a hot lead who scored above 7 in our system. Offer them an immediate demo and fast-track their onboarding.",
      }
    },
    {
      id: "crm-hot", type: "customNode",
      position: { x: 1260, y: 100 },
      data: { type: "update_crm", label: "Mark as Qualified", stage: "qualified" }
    },
    // False branch → WhatsApp nurture
    {
      id: "wa-cold", type: "customNode",
      position: { x: 960, y: 320 },
      data: {
        type: "whatsapp", label: "WhatsApp Nurture",
        toPhone: "{{phone}}", templateName: "", branches: [],
      }
    },
    {
      id: "delay-cold", type: "customNode",
      position: { x: 1260, y: 320 },
      data: { type: "delay", label: "Wait 2 Days", delayDays: 2, delayHours: 0, delayMinutes: 0 }
    },
    {
      id: "wa-cold-2", type: "customNode",
      position: { x: 1560, y: 320 },
      data: {
        type: "whatsapp", label: "Follow-up Message",
        toPhone: "{{phone}}", templateName: "", branches: [],
      }
    },
    // Fallback branch → basic email
    {
      id: "email-fallback", type: "customNode",
      position: { x: 960, y: 520 },
      data: {
        type: "email", label: "Send Nurture Email",
        toEmail: "{{email}}",
        subject: "Hi {{name}}, here's something for you",
        html: "<p>Hi {{name}},</p><p>Thanks for your interest. Here are some resources to help you get started.</p>",
      }
    },
  ],
  edges: [
    // Trigger → CRM entry
    { id: "e1",  source: "trigger-1",    target: "crm-entry",      sourceHandle: "output", type: "flowEdge", animated: true, style: { stroke: "#22c55e" } },
    // CRM → Condition
    { id: "e2",  source: "crm-entry",    target: "condition-1",    sourceHandle: "output", type: "flowEdge" },
    // Condition TRUE → Voice
    { id: "e3",  source: "condition-1",  target: "voice-hot",      sourceHandle: "true",     type: "flowEdge", animated: true, label: "Hot Lead ✓", data: { branchType: "true"     }, style: { stroke: "#22c55e" } },
    // Voice → CRM qualified
    { id: "e4",  source: "voice-hot",    target: "crm-hot",        sourceHandle: "output", type: "flowEdge" },
    // Condition FALSE → WhatsApp cold
    { id: "e5",  source: "condition-1",  target: "wa-cold",        sourceHandle: "false",    type: "flowEdge", animated: true, label: "Cold Lead ✗", data: { branchType: "false"    }, style: { stroke: "#ef4444" } },
    // WhatsApp cold → Delay → WA cold 2
    { id: "e6",  source: "wa-cold",      target: "delay-cold",     sourceHandle: "output", type: "flowEdge" },
    { id: "e7",  source: "delay-cold",   target: "wa-cold-2",      sourceHandle: "output", type: "flowEdge", animated: true },
    // Condition FALLBACK → Email
    { id: "e8",  source: "condition-1",  target: "email-fallback", sourceHandle: "fallback", type: "flowEdge", label: "No score", data: { branchType: "fallback" }, style: { stroke: "#94a3b8" } },
  ],
  configFields: [
    { nodeId: "trigger-1",    fieldKey: "sheetUrl",     label: "Google Sheet URL",    type: "url",             required: true,  helperText: "Sheet must have a 'score' column (0-10)" },
    { nodeId: "condition-1",  fieldKey: "value",        label: "Hot Lead Threshold",  type: "number",          required: true,  helperText: "Leads above this score get a voice call" },
    { nodeId: "wa-cold",      fieldKey: "templateName", label: "Cold Lead Template",  type: "template_picker", required: true  },
    { nodeId: "wa-cold-2",    fieldKey: "templateName", label: "Follow-up Template",  type: "template_picker", required: false },
    { nodeId: "voice-hot",    fieldKey: "voiceId",      label: "Hot Lead Voice",      type: "select",          required: false },
    { nodeId: "email-fallback",fieldKey: "subject",     label: "Fallback Email Subj", type: "text",            required: false },
  ],
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  DRIP_TEMPLATE,
  REMINDER_TEMPLATE,
  SHEETS_FORMS_TEMPLATE,
  META_ADS_TEMPLATE,
  CONDITIONAL_QUALIFIER_TEMPLATE,
]

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id)
}