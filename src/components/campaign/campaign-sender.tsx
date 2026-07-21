"use client";

import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Upload, Send, X, Loader2, FileSpreadsheet, Plus, CheckCircle2, RefreshCw } from "lucide-react";
import { ParsedContact, WhatsAppTemplate } from "@/types";
import { parsePhoneFromExcel, isValidPhone } from "@/lib/utils";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const schema = z.object({
  campaign_name: z.string().min(2, "Campaign name required"),
  template_name: z.string().min(1, "Select a template"),
  template_language: z.string().min(1),
  send_later: z.boolean().default(false),
  scheduled_at: z.string().optional().nullable(),
}).refine(
  (data) => !data.send_later || (data.scheduled_at && new Date(data.scheduled_at).getTime() > Date.now()),
  {
    message: "Schedule time must be in the future",
    path: ["scheduled_at"],
  }
);

type FormData = z.infer<typeof schema>;

export function CampaignSender() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"form" | "preview" | "success">("form");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { template_language: "en", send_later: false },
  });

  const templateName = watch("template_name");
  const sendLater = watch("send_later");

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      const data = await res.json();
      setTemplates(data);
      if (data.length === 0) {
        toast.warning("No approved templates found. Get a template approved in Meta Business Manager first.");
      }
    } catch {
      toast.error("Could not load templates. Check WhatsApp Configuration in Settings.");
      // Fallback to hello_world
      setTemplates([{ name: "hello_world", language: "en_US", display_name: "Hello World" }]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open]);

  const handleFile = (file: File) => {
    if (!file) return;

    if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        complete: (result) => {
          const parsed = parseRows(result.data as Record<string, string>[]);
          setContacts(parsed);
        },
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
        const parsed = parseRows(rows);
        setContacts(parsed);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const parseRows = (rows: Record<string, unknown>[]): ParsedContact[] => {
    return rows
      .map((row) => {
        const phone = String(row.phone ?? row.Phone ?? row.PHONE ?? row.mobile ?? row.Mobile ?? "");
        const name = String(row.name ?? row.Name ?? row.NAME ?? "").trim();
        const email = String(row.email ?? row.Email ?? "").trim();
        return {
          phone: parsePhoneFromExcel(phone),
          name: name || undefined,
          email: email || undefined,
        };
      })
      .filter((c) => isValidPhone(c.phone));
  };

  const onSubmit = async (data: FormData) => {
    if (contacts.length === 0) {
      toast.error("Upload a contacts file first");
      return;
    }
    if (step === "form") {
      setStep("preview");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_name: data.campaign_name,
          template_name: data.template_name,
          template_language: data.template_language,
          contacts,
          scheduled_at: data.send_later ? data.scheduled_at : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to send campaign");
      }

      setStep("success");
      toast.success(data.send_later ? "Campaign scheduled successfully!" : "Campaign sent successfully!");
      setTimeout(() => {
        setOpen(false);
        reset();
        setContacts([]);
        setStep("form");
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    reset();
    setContacts([]);
    setStep("form");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-all"
      >
        <Plus className="w-4 h-4" />
        New Campaign
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {step === "success" 
                    ? watch("send_later") ? "Campaign Scheduled!" : "Campaign Sent!"
                    : step === "preview" ? "Review & Send" : "New Campaign"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step === "preview" ? `${contacts.length} contacts ready` : "Upload contacts and choose template"}
                </p>
              </div>
              <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {step === "success" ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  {watch("send_later") ? "Campaign scheduled!" : "Campaign sent!"}
                </p>
                <p className="text-sm text-muted-foreground mt-1 text-center px-6">
                  {watch("send_later")
                    ? `Messages will be sent automatically on ${new Date(watch("scheduled_at")!).toLocaleString("en-IN")}`
                    : "Messages delivered successfully."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
                {step === "form" && (
                  <>
                    {/* Campaign Name */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Campaign Name</label>
                      <input
                        {...register("campaign_name")}
                        placeholder="e.g. Diwali Offer 2026"
                        className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {errors.campaign_name && <p className="text-xs text-destructive">{errors.campaign_name.message}</p>}
                    </div>

                    {/* Template */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">WhatsApp Template</label>
                        <button
                          type="button"
                          onClick={fetchTemplates}
                          disabled={loadingTemplates}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${loadingTemplates ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>

                      {loadingTemplates ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-background border border-input rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Loading templates...</span>
                        </div>
                      ) : (
                        <select
                          {...register("template_name")}
                          onChange={(e) => {
                            const t = templates.find((t) => t.name === e.target.value);
                            setValue("template_name", e.target.value);
                            if (t) setValue("template_language", t.language);
                          }}
                          className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">Select a template</option>
                          {templates.map((t) => (
                            <option key={`${t.name}-${t.language}`} value={t.name}>
                              {t.display_name} ({t.language})
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.template_name && <p className="text-xs text-destructive">{errors.template_name.message}</p>}
                    </div>

                    {/* File Upload */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Contacts File</label>
                      <div
                        className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files[0];
                          if (file) handleFile(file);
                        }}
                      >
                        {contacts.length > 0 ? (
                          <div className="flex items-center justify-center gap-3">
                            <FileSpreadsheet className="w-5 h-5 text-primary" />
                            <div className="text-left">
                              <p className="text-sm font-medium text-foreground">{contacts.length} contacts loaded</p>
                              <p className="text-xs text-muted-foreground">Click to replace</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-foreground">Drop .xlsx or .csv file</p>
                            <p className="text-xs text-muted-foreground mt-1">Columns: phone, name (optional), email (optional)</p>
                          </>
                        )}
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                      />
                    </div>

                    {/* Schedule Option */}
                    <div className="space-y-3 pt-4 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="send_later"
                          {...register("send_later")}
                          className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                        />
                        <label htmlFor="send_later" className="text-sm font-medium text-foreground cursor-pointer">
                          Schedule campaign for later
                        </label>
                      </div>

                      {sendLater && (
                        <div className="space-y-1.5 pl-6 animate-fade-in">
                          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Choose Date & Time
                          </label>
                          <Controller
                            control={control}
                            name="scheduled_at"
                            render={({ field }) => (
                              <DatePicker
                                selected={field.value ? new Date(field.value) : null}
                                onChange={(date: Date | null) => field.onChange(date ? date.toISOString() : "")}
                                showTimeSelect
                                timeFormat="HH:mm"
                                timeIntervals={15}
                                dateFormat="MMMM d, yyyy h:mm aa"
                                minDate={new Date()}
                                className="w-full px-3 py-2.5 bg-background border border-input rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                placeholderText="Select date and time"
                                isClearable
                              />
                            )}
                          />
                          {errors.scheduled_at && (
                            <p className="text-xs text-destructive">{errors.scheduled_at.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {step === "preview" && (
                  <div className="space-y-4">
                    <div className="bg-muted/40 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Template</span>
                        <span className="font-medium text-foreground">{templateName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Recipients</span>
                        <span className="font-medium text-foreground">{contacts.length}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Preview (first 5)</p>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Phone</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {contacts.slice(0, 5).map((c, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 text-foreground font-mono text-xs">{c.phone}</td>
                                <td className="px-3 py-2 text-muted-foreground">{c.name ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {contacts.length > 5 && (
                        <p className="text-xs text-muted-foreground">+{contacts.length - 5} more contacts</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {step === "preview" && (
                    <button
                      type="button"
                      onClick={() => setStep("form")}
                      className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-all"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={sending || loadingTemplates}
                    className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : step === "preview" ? (
                      watch("send_later") ? (
                        <>Schedule Campaign</>
                      ) : (
                        <><Send className="w-4 h-4" /> Send Campaign</>
                      )
                    ) : (
                      "Continue"
                    )}
                  </button>

                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
