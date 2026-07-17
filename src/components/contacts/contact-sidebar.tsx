"use client";

import { useEffect, useState } from "react";
import { X, Tag as TagIcon, Plus, Loader2, Save, XCircle } from "lucide-react";
import { Contact } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";
import * as Popover from "@radix-ui/react-popover";

interface ContactSidebarProps {
  contact: Contact;
  onClose?: () => void;
  onContactUpdated?: (updated: Contact) => void;
  hideHeader?: boolean;
}

export function ContactSidebar({ contact, onClose, onContactUpdated, hideHeader }: ContactSidebarProps) {
  const { workspace } = useWorkspace();
  const supabase = createClient();

  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [fieldSchemas, setFieldSchemas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Local state for the contact being edited
  const [localTags, setLocalTags] = useState<string[]>(contact.tags || []);
  const [localFields, setLocalFields] = useState<Record<string, any>>(contact.custom_fields || {});
  
  const [savingTags, setSavingTags] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  useEffect(() => {
    // Reset local state when contact prop changes
    setLocalTags(contact.tags || []);
    setLocalFields(contact.custom_fields || {});
  }, [contact]);

  useEffect(() => {
    if (!workspace?.id) return;

    const fetchConfig = async () => {
      setLoading(true);
      try {
        const [tagsRes, fieldsRes] = await Promise.all([
          supabase.from("tags").select("*").eq("workspace_id", workspace.id).order("name"),
          supabase.from("custom_field_schemas").select("*").eq("workspace_id", workspace.id).order("name"),
        ]);
        
        if (tagsRes.error) throw tagsRes.error;
        if (fieldsRes.error) throw fieldsRes.error;

        setAvailableTags(tagsRes.data || []);
        // Handle migration column renaming seamlessly
        const normalizedFields = (fieldsRes.data || []).map((f: any) => ({
          ...f,
          name: f.field_name || f.name,
          type: f.field_type || f.type,
        }));
        setFieldSchemas(normalizedFields);
      } catch (err: any) {
        console.error("Failed to load workspace configuration:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [workspace?.id, supabase]);

  const updateContactAPI = async (updates: Partial<Contact>) => {
    const res = await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id, ...updates }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update contact");
    }
    const data = await res.json();
    if (onContactUpdated && data.contact) {
      onContactUpdated(data.contact);
    }
    return data.contact;
  };

  const handleAddTag = async (tagName: string) => {
    if (localTags.includes(tagName)) return;
    const nextTags = [...localTags, tagName];
    setSavingTags(true);
    try {
      await updateContactAPI({ tags: nextTags });
      setLocalTags(nextTags);
      toast.success("Tag added");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingTags(false);
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    const nextTags = localTags.filter(t => t !== tagName);
    setSavingTags(true);
    try {
      await updateContactAPI({ tags: nextTags });
      setLocalTags(nextTags);
      toast.success("Tag removed");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingTags(false);
    }
  };

  const handleUpdateField = async (fieldName: string, value: string) => {
    if (localFields[fieldName] === value) return;
    const nextFields = { ...localFields, [fieldName]: value };
    // Remove empty keys
    if (!value) delete nextFields[fieldName];

    setSavingField(fieldName);
    try {
      await updateContactAPI({ custom_fields: nextFields });
      setLocalFields(nextFields);
      toast.success("Field saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingField(null);
    }
  };

  const contactName = contact.full_name || contact.name || contact.phone;

  return (
    <div className="flex flex-col h-full bg-white text-gray-900">
      {!hideHeader && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <h3 className="font-semibold text-sm">Contact Details</h3>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Avatar Area */}
          <div className="p-5 flex flex-col items-center text-center border-b border-border shrink-0">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl mb-3">
              {getInitials(contact.full_name || contact.name, contact.phone)}
            </div>
            <h2 className="font-semibold text-base">{contactName}</h2>
            <p className="text-xs text-gray-500 mt-1">{contact.phone}</p>
            {contact.email && <p className="text-xs text-gray-500 mt-1">{contact.email}</p>}
          </div>
        </>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="p-5 space-y-6">
            
            {/* Tags Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5" /> Tags
                </h4>
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button className="text-primary hover:bg-primary/10 p-1 rounded-md transition-colors disabled:opacity-50" disabled={savingTags}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content align="end" sideOffset={4} className="bg-white border border-border rounded-xl shadow-lg p-2 w-48 z-50 animate-in fade-in zoom-in-95">
                      <p className="text-[10px] font-semibold text-gray-500 mb-2 px-2 uppercase tracking-wider">Add Tag</p>
                      {availableTags.filter(t => !localTags.includes(t.name)).length === 0 ? (
                        <p className="text-xs text-gray-500 px-2 pb-2">No tags available</p>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {availableTags
                            .filter(t => !localTags.includes(t.name))
                            .map(t => (
                              <button
                                key={t.id}
                                onClick={() => handleAddTag(t.name)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 rounded-md text-left text-sm transition-colors"
                              >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                                <span className="truncate">{t.name}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>

              <div className="flex flex-wrap gap-2">
                {localTags.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No tags added</p>
                ) : (
                  localTags.map(tagName => {
                    const tagDef = availableTags.find(t => t.name === tagName);
                    const color = tagDef?.color || "#94a3b8"; // Default slate if tag deleted from settings
                    return (
                      <span
                        key={tagName}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                        style={{
                          backgroundColor: `${color}15`,
                          color: color,
                          borderColor: `${color}30`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {tagName}
                        <button
                          onClick={() => handleRemoveTag(tagName)}
                          disabled={savingTags}
                          className="ml-0.5 hover:bg-black/10 rounded-full p-0.5 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
            </div>

            {/* Custom Fields Section */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Custom Fields
              </h4>
              {fieldSchemas.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No custom fields configured</p>
              ) : (
                <div className="space-y-3">
                  {fieldSchemas.map((schema) => (
                    <div key={schema.id} className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-900 capitalize">
                        {schema.name}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={schema.type === "number" ? "number" : "text"}
                          defaultValue={localFields[schema.name] || ""}
                          placeholder="Empty"
                          onBlur={(e) => handleUpdateField(schema.name, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-full px-3 py-2 bg-transparent border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all disabled:opacity-50"
                          disabled={savingField === schema.name}
                        />
                        {savingField === schema.name && (
                          <div className="absolute right-2 text-gray-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
