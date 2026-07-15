"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
  X,
  Pencil,
  RotateCcw,
  Upload,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/context/WorkspaceContext";
import type {
  MessageTemplate,
  TemplateButton,
  TemplateSampleValues,
} from "@/types";
import {
  extractVariableIndices,
  TEMPLATE_LIMITS,
} from "@/lib/whatsapp/template-validators";

const CATEGORIES = ["Marketing", "Utility", "Authentication"] as const;
type HeaderFormat = "none" | "text" | "image" | "video" | "document";
const HEADER_FORMATS: HeaderFormat[] = ["none", "text", "image", "video", "document"];

const categoryColors: Record<string, string> = {
  Marketing: "bg-purple-50 text-purple-700 border-purple-200",
  Utility: "bg-blue-50 text-blue-700 border-blue-200",
  Authentication: "bg-amber-50 text-amber-700 border-amber-200",
};

const statusConfigs: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Draft", classes: "bg-gray-100 text-gray-700 border-gray-200" },
  PENDING: { label: "Pending Review", classes: "bg-amber-100 text-amber-700 border-amber-200 animate-pulse" },
  APPROVED: { label: "Approved", classes: "bg-green-100 text-green-700 border-green-200" },
  REJECTED: { label: "Rejected", classes: "bg-red-100 text-red-700 border-red-200" },
  PAUSED: { label: "Paused", classes: "bg-amber-50 text-amber-600 border-amber-100" },
  DISABLED: { label: "Disabled", classes: "bg-gray-100 text-gray-500 border-gray-200" },
  IN_APPEAL: { label: "In Appeal", classes: "bg-blue-100 text-blue-700 border-blue-200" },
  PENDING_DELETION: { label: "Pending Deletion", classes: "bg-red-50 text-red-500 border-red-100" },
};

interface TemplateFormData {
  name: string;
  category: MessageTemplate["category"];
  language: string;
  header_format: HeaderFormat;
  header_content: string;
  header_media_url: string;
  header_sample: string;
  body_text: string;
  body_samples: string[];
  footer_text: string;
  buttons: TemplateButton[];
}

const emptyForm: TemplateFormData = {
  name: "",
  category: "Marketing",
  language: "en_US",
  header_format: "none",
  header_content: "",
  header_media_url: "",
  header_sample: "",
  body_text: "",
  body_samples: [],
  footer_text: "",
  buttons: [],
};

const COMMON_LANGUAGE_CODES = [
  "en_US", "en_GB", "en", "es", "es_ES", "es_MX", "fr", "fr_FR", "de", "it", "pt_BR", "pt_PT", "nl", "pl", "ru", "tr", "lt"
];

function emptyButton(type: TemplateButton["type"]): TemplateButton {
  switch (type) {
    case "QUICK_REPLY":
      return { type: "QUICK_REPLY", text: "" };
    case "URL":
      return { type: "URL", text: "", url: "" };
    case "PHONE_NUMBER":
      return { type: "PHONE_NUMBER", text: "", phone_number: "" };
    case "COPY_CODE":
      return { type: "COPY_CODE", text: "", example: "" };
  }
}

export function TemplateManagerPanel() {
  const supabase = createClient();
  const { workspace } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);

  const bodyVarCount = useMemo(
    () => extractVariableIndices(form.body_text).length,
    [form.body_text]
  );
  const headerVarCount = useMemo(
    () =>
      form.header_format === "text"
        ? extractVariableIndices(form.header_content).length
        : 0,
    [form.header_format, form.header_content]
  );

  useEffect(() => {
    setForm((prev) => {
      if (prev.body_samples.length === bodyVarCount) return prev;
      const next = prev.body_samples.slice(0, bodyVarCount);
      while (next.length < bodyVarCount) next.push("");
      return { ...prev, body_samples: next };
    });
  }, [bodyVarCount]);

  const fetchTemplates = useCallback(async (wsId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (workspace?.id) {
      fetchTemplates(workspace.id);
    }
  }, [workspace?.id, fetchTemplates]);

  function buildSubmitPayload() {
    const sample_values: TemplateSampleValues = {};
    if (form.body_samples.some((v) => v.trim())) {
      sample_values.body = form.body_samples.map((v) => v.trim());
    }
    if (form.header_format === "text" && form.header_sample.trim()) {
      sample_values.header = [form.header_sample.trim()];
    }

    return {
      name: form.name.trim(),
      category: form.category,
      language: form.language.trim() || "en_US",
      header_type: form.header_format === "none" ? undefined : form.header_format,
      header_content:
        form.header_format === "text" ? form.header_content.trim() : undefined,
      header_media_url:
        form.header_format !== "none" && form.header_format !== "text"
          ? form.header_media_url.trim() || undefined
          : undefined,
      body_text: form.body_text.trim(),
      footer_text: form.footer_text.trim() || undefined,
      buttons: form.buttons.length > 0 ? form.buttons : undefined,
      sample_values:
        Object.keys(sample_values).length > 0 ? sample_values : undefined,
    };
  }

  function openEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({
      name: template.name,
      category: template.category,
      language: template.language || "en_US",
      header_format: (template.header_type ?? "none") as HeaderFormat,
      header_content: template.header_content ?? "",
      header_media_url: template.header_media_url ?? "",
      header_sample: template.sample_values?.header?.[0] ?? "",
      body_text: template.body_text,
      body_samples: template.sample_values?.body ?? [],
      footer_text: template.footer_text ?? "",
      buttons: template.buttons ?? [],
    });
    setDialogOpen(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (form.category === "Authentication") return;
    try {
      setSubmitting(true);
      const isEdit = editingId !== null;
      const url = isEdit
        ? `/api/whatsapp/templates/${editingId}`
        : "/api/whatsapp/templates/submit";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSubmitPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || `${isEdit ? "Edit" : "Submit"} failed (HTTP ${res.status})`
        );
      }
      if (workspace?.id) await fetchTemplates(workspace.id);
      toast.success(
        data.dry_run
          ? isEdit
            ? "Template updated (dry-run — no Meta call)"
            : "Template saved (dry-run — no Meta call)"
          : isEdit
            ? "Edit submitted — Meta typically reviews within 24 hours."
            : "Submitted to Meta — typical review time is 24 hours."
      );
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      console.error("Submit error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncFromMeta() {
    if (!workspace?.id) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/whatsapp/templates/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      toast.success(
        `Synced ${data.total} template${data.total === 1 ? "" : "s"} from Meta` +
          (data.inserted || data.updated
            ? ` (${data.inserted} new, ${data.updated} updated)`
            : "")
      );
      await fetchTemplates(workspace.id);
    } catch (err) {
      console.error("Template sync error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to sync templates");
    } finally {
      setSyncing(false);
    }
  }

  async function confirmDelete() {
    const target = templateToDelete;
    if (!target || deletingId) return;
    setDeletingId(target.id);
    try {
      const res = await fetch(`/api/whatsapp/templates/${target.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((t) => t.id !== target.id));
      setTemplateToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  type ButtonPatch = {
    text?: string;
    url?: string;
    phone_number?: string;
    example?: string;
  };
  function updateButton(index: number, patch: ButtonPatch) {
    setForm((prev) => {
      const current = prev.buttons[index];
      if (!current) return prev;
      const next = [...prev.buttons];
      switch (current.type) {
        case "QUICK_REPLY":
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
          };
          break;
        case "URL":
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.url !== undefined && { url: patch.url }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
        case "PHONE_NUMBER":
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.phone_number !== undefined && {
              phone_number: patch.phone_number,
            }),
          };
          break;
        case "COPY_CODE":
          next[index] = {
            ...current,
            ...(patch.text !== undefined && { text: patch.text }),
            ...(patch.example !== undefined && { example: patch.example }),
          };
          break;
      }
      return { ...prev, buttons: next };
    });
  }

  function changeButtonType(index: number, type: TemplateButton["type"]) {
    setForm((prev) => {
      const next = [...prev.buttons];
      next[index] = emptyButton(type);
      return { ...prev, buttons: next };
    });
  }

  function removeButton(index: number) {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((_, i) => i !== index),
    }));
  }

  function addButton() {
    if (form.buttons.length >= TEMPLATE_LIMITS.maxButtonsTotal) return;
    setForm((prev) => ({
      ...prev,
      buttons: [...prev.buttons, emptyButton("QUICK_REPLY")],
    }));
  }

  // Native mock upload for image header
  async function triggerLogoUpload() {
    headerFileRef.current?.click();
  }

  async function handleHeaderFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Header image must be a JPEG or PNG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`Image is too large — Meta's limit is 5 MB.`);
      return;
    }

    setUploadingHeader(true);
    try {
      // Flowra uses supabase storage for public chat media uploads,
      // let's upload to public 'media' bucket.
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `templates/${fileName}`;

      const { data, error } = await supabase.storage
        .from("chat-media")
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("chat-media")
        .getPublicUrl(filePath);

      setForm((f) => ({ ...f, header_media_url: publicUrl }));
      toast.success("Image uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed.");
    } finally {
      setUploadingHeader(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] animate-in fade-in-50 duration-200 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-foreground mb-1">Message Templates</h1>
          <p className="text-[14px] text-muted-foreground">
            Create WhatsApp message templates for outbound broadcasts and notifications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncFromMeta}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 border border-border bg-white hover:bg-muted text-[13px] font-semibold text-foreground rounded-lg shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync from Meta"}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-foreground font-semibold text-[13px] rounded-lg shadow-sm"
          >
            <Plus className="size-4" />
            New Template
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">No templates found in this workspace.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Create your first message template or click Sync from Meta to pull approved ones.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => {
            const statusKey = t.status || "DRAFT";
            const status = statusConfigs[statusKey] || { label: statusKey, classes: "bg-gray-100 text-gray-700" };
            return (
              <div key={t.id} className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground text-[14px]">{t.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full font-bold uppercase ${categoryColors[t.category] || "bg-gray-50"}`}>
                      {t.category}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 border rounded-full font-bold ${status.classes}`}>
                      {status.label}
                    </span>
                    {t.language && (
                      <span className="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                        {t.language}
                      </span>
                    )}
                    {t.quality_score && (
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          t.quality_score === "GREEN"
                            ? "text-emerald-600"
                            : t.quality_score === "YELLOW"
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {t.quality_score}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {t.body_text}
                  </p>
                  {t.footer_text && (
                    <p className="text-[11px] text-muted-foreground/80 italic">
                      {t.footer_text}
                    </p>
                  )}
                  {t.submission_error && (
                    <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mt-1">
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <span>{t.submission_error}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-muted">
                  {statusKey === "APPROVED" && (
                    <button
                      onClick={() => openEdit(t)}
                      className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/80 px-2.5 py-1.5 rounded-lg border border-border transition-all"
                    >
                      <Pencil className="size-3" />
                      Edit
                    </button>
                  )}
                  {(statusKey === "REJECTED" || statusKey === "PAUSED") && (
                    <button
                      onClick={() => openEdit(t)}
                      className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted/80 px-2.5 py-1.5 rounded-lg border border-border transition-all"
                    >
                      <RotateCcw className="size-3" />
                      Resubmit
                    </button>
                  )}
                  <button
                    onClick={() => setTemplateToDelete(t)}
                    disabled={deletingId === t.id}
                    className="flex items-center justify-center size-8 border border-red-100 hover:bg-red-50 rounded-lg text-red-500 hover:text-red-700 transition-all shrink-0"
                    title="Delete template"
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Modal Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDialogOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border pb-3 mb-5">
              <h3 className="text-[16px] font-bold text-foreground">
                {editingId ? "Edit Message Template" : "New Message Template"}
              </h3>
              <button onClick={() => setDialogOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              {form.category === "Authentication" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <p>
                    AUTHENTICATION templates utilize fixed OTP workflows. Create them in your Meta Manager and click Sync from Meta.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">Template Name</label>
                <input
                  type="text"
                  placeholder="e.g. order_confirmation"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={editingId !== null}
                  className="w-full border border-border rounded-lg px-3.5 py-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed bg-white"
                />
                <p className="text-[11px] text-muted-foreground">
                  {editingId
                    ? "Name cannot be edited once saved on Meta."
                    : "Lowercase letters, digits, and underscores only."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-foreground">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="w-full border border-border rounded-lg px-3.5 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-foreground">Language</label>
                  <input
                    placeholder="en_US"
                    list="tpl-langs"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    disabled={editingId !== null}
                    className="w-full border border-border rounded-lg px-3.5 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <datalist id="tpl-langs">
                    {COMMON_LANGUAGE_CODES.map((code) => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">Header Format</label>
                <select
                  value={form.header_format}
                  onChange={(e) => setForm({ ...form, header_format: e.target.value as HeaderFormat })}
                  className="w-full border border-border rounded-lg px-3.5 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                >
                  {HEADER_FORMATS.map((type) => (
                    <option key={type} value={type}>
                      {type === "none" ? "None" : type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>

                {form.header_format === "text" && (
                  <div className="space-y-2 mt-2">
                    <input
                      placeholder="Header text (max 60 chars, optional variable {{1}})"
                      value={form.header_content}
                      onChange={(e) => setForm({ ...form, header_content: e.target.value })}
                      maxLength={TEMPLATE_LIMITS.headerTextMaxLength}
                      className="w-full border border-border rounded-lg px-3.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                    />
                    {headerVarCount > 0 && (
                      <input
                        placeholder="Sample value for {{1}} (required for Meta review)"
                        value={form.header_sample}
                        onChange={(e) => setForm({ ...form, header_sample: e.target.value })}
                        className="w-full border border-border rounded-lg px-3.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                    )}
                  </div>
                )}

                {form.header_format === "image" && (
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <input
                        placeholder="Image URL"
                        value={form.header_media_url}
                        onChange={(e) => setForm({ ...form, header_media_url: e.target.value })}
                        className="w-full border border-border rounded-lg px-3.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                      />
                      <button
                        onClick={triggerLogoUpload}
                        disabled={uploadingHeader}
                        type="button"
                        className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg hover:bg-muted text-xs font-semibold shrink-0"
                      >
                        {uploadingHeader ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                        Upload
                      </button>
                      <input
                        ref={headerFileRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleHeaderFileChange}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}

                {(form.header_format === "video" || form.header_format === "document") && (
                  <div className="mt-2">
                    <input
                      placeholder={`${form.header_format.toUpperCase()} sample URL (required for review)`}
                      value={form.header_media_url}
                      onChange={(e) => setForm({ ...form, header_media_url: e.target.value })}
                      className="w-full border border-border rounded-lg px-3.5 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">Body Text</label>
                <textarea
                  placeholder="E.g. Hello {{1}}, your order {{2}} has been shipped!"
                  value={form.body_text}
                  onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                  rows={4}
                  className="w-full border border-border rounded-lg px-3.5 py-2.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                />

                {bodyVarCount > 0 && (
                  <div className="space-y-2 mt-3 bg-muted/20 p-3.5 rounded-lg border border-border/60">
                    <span className="text-xs font-bold text-foreground">Sample values for review:</span>
                    {Array.from({ length: bodyVarCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold w-10 text-muted-foreground shrink-0">{`{{${i + 1}}}`}</span>
                        <input
                          placeholder={`Sample value for variable ${i + 1}`}
                          value={form.body_samples[i] || ""}
                          onChange={(e) => {
                            const next = [...form.body_samples];
                            next[i] = e.target.value;
                            setForm({ ...form, body_samples: next });
                          }}
                          className="w-full border border-border rounded-lg px-3.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-foreground">Footer Text (optional)</label>
                <input
                  placeholder="E.g. Reply STOP to opt out"
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                  maxLength={TEMPLATE_LIMITS.footerMaxLength}
                  className="w-full border border-border rounded-lg px-3.5 py-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-white"
                />
              </div>

              {/* Buttons */}
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold text-foreground">Buttons</label>
                  {form.buttons.length < TEMPLATE_LIMITS.maxButtonsTotal && (
                    <button
                      onClick={addButton}
                      type="button"
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="size-3" /> Add Button
                    </button>
                  )}
                </div>

                {form.buttons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No buttons defined for this template.</p>
                ) : (
                  <div className="space-y-3">
                    {form.buttons.map((btn, index) => (
                      <div key={index} className="flex gap-3 items-start border border-border bg-muted/10 p-3 rounded-lg relative">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
                          <div className="space-y-1">
                            <span className="text-[11px] font-bold text-muted-foreground">Type</span>
                            <select
                              value={btn.type}
                              onChange={(e) => changeButtonType(index, e.target.value as any)}
                              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-white"
                            >
                              <option value="QUICK_REPLY">Quick Reply</option>
                              <option value="URL">Call to Action (URL)</option>
                              <option value="PHONE_NUMBER">Call to Action (Phone)</option>
                              <option value="COPY_CODE">Copy Offer Code</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[11px] font-bold text-muted-foreground">Text</span>
                            <input
                              placeholder="Button Label"
                              value={btn.text}
                              onChange={(e) => updateButton(index, { text: e.target.value })}
                              maxLength={TEMPLATE_LIMITS.buttonTextMaxLength}
                              className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                            />
                          </div>

                          {btn.type === "URL" && (
                            <>
                              <div className="space-y-1">
                                <span className="text-[11px] font-bold text-muted-foreground">URL Suffix</span>
                                <input
                                  placeholder="https://example.com/{{1}}"
                                  value={btn.url}
                                  onChange={(e) => updateButton(index, { url: e.target.value })}
                                  className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                                />
                              </div>
                              {btn.url.includes("{{1}}") && (
                                <div className="col-span-full space-y-1">
                                  <span className="text-[11px] font-bold text-muted-foreground">URL Sample Value</span>
                                  <input
                                    placeholder="Sample variable (e.g. promo20)"
                                    value={btn.example || ""}
                                    onChange={(e) => updateButton(index, { example: e.target.value })}
                                    className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {btn.type === "PHONE_NUMBER" && (
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold text-muted-foreground">Phone</span>
                              <input
                                placeholder="+15551234567"
                                value={btn.phone_number}
                                onChange={(e) => updateButton(index, { phone_number: e.target.value })}
                                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                              />
                            </div>
                          )}

                          {btn.type === "COPY_CODE" && (
                            <div className="space-y-1">
                              <span className="text-[11px] font-bold text-muted-foreground">Code Example</span>
                              <input
                                placeholder="E.g. SALE20"
                                value={btn.example}
                                onChange={(e) => updateButton(index, { example: e.target.value })}
                                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                              />
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => removeButton(index)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 shrink-0 self-center"
                          title="Remove button"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="flex-1 py-2 border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || form.category === "Authentication"}
                className="flex-1 py-2 bg-primary text-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>Submit to Meta</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {templateToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTemplateToDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-foreground mb-2">Delete Message Template</h3>
            <p className="text-[13px] text-muted-foreground mb-5 leading-relaxed">
              Are you sure you want to delete <strong className="text-foreground">#{templateToDelete.name}</strong>?
              {templateToDelete.meta_template_id && (
                <span className="block mt-2 text-red-600 font-semibold">
                  This will delete the template on Meta as well as locally. This cannot be undone.
                </span>
              )}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setTemplateToDelete(null)}
                className="flex-1 py-2 border border-border rounded-lg text-[14px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deletingId === templateToDelete.id}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[14px] font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                {deletingId === templateToDelete.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Deleting...
                  </>
                ) : (
                  "Delete Template"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
