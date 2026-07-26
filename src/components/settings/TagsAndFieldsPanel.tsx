"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Tag as TagIcon, X, SlidersHorizontal, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/context/WorkspaceContext";

const PRESET_COLORS = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
];

export function TagsAndFieldsPanel() {
  const supabase = createClient();
  const { workspace, profile, member } = useWorkspace();
  const canEditSettings = member.role === "owner" || member.role === "admin";

  // --- Tags State ---
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tags, setTags] = useState<any[]>([]);
  const [tagToDelete, setTagToDelete] = useState<any | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagDeleting, setTagDeleting] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[3].value);

  // --- Custom Fields State ---
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [fields, setFields] = useState<any[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [fieldCreating, setFieldCreating] = useState(false);
  const [busyFieldId, setBusyFieldId] = useState<string | null>(null);

  // --- Fetch Tags ---
  const fetchTags = useCallback(async (wsId: string) => {
    try {
      setTagsLoading(true);
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTags(data || []);
    } catch (err: any) {
      console.error("Failed to fetch tags:", err?.message || err);
      toast.error(err?.message || "Failed to load tags");
    } finally {
      setTagsLoading(false);
    }
  }, [supabase]);

  // --- Fetch Fields ---
  const fetchFields = useCallback(async (wsId: string) => {
    try {
      setFieldsLoading(true);
      const { data, error } = await supabase
        .from("custom_field_schemas")
        .select("*")
        .eq("workspace_id", wsId)
        .order("name", { ascending: true });

      if (error) throw error;
      setFields(data || []);
    } catch (err: any) {
      console.error("Failed to fetch fields:", err?.message || err);
      toast.error(err?.message || "Failed to load custom fields");
    } finally {
      setFieldsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (workspace?.id) {
      fetchTags(workspace.id);
      fetchFields(workspace.id);
    }
  }, [workspace?.id, fetchTags, fetchFields]);

  // --- Tag Operations ---
  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name is required");
      return;
    }

    try {
      setTagSaving(true);
      if (!workspace?.id || !profile?.id) {
        toast.error("Session information not found");
        return;
      }

      const { error } = await supabase.from("tags").insert({
        workspace_id: workspace.id,
        created_by: profile.id,
        name: newTagName.trim(),
        color: selectedColor,
      });

      if (error) throw error;

      toast.success("Tag created successfully");
      setNewTagName("");
      setSelectedColor(PRESET_COLORS[3].value);
      await fetchTags(workspace.id);
    } catch (err) {
      console.error("Tag create error:", err);
      toast.error(`Failed to create tag: ${(err as Error)?.message || JSON.stringify(err)}`);
    } finally {
      setTagSaving(false);
    }
  };

  const handleDeleteTag = async () => {
    if (!tagToDelete || !workspace?.id) return;

    try {
      setTagDeleting(true);
      const { error } = await supabase
        .from("tags")
        .delete()
        .eq("id", tagToDelete.id);

      if (error) throw error;

      toast.success("Tag deleted");
      setTags((prev) => prev.filter((t) => t.id !== tagToDelete.id));
      setTagToDelete(null);
    } catch (err) {
      console.error("Tag delete error:", err);
      toast.error("Failed to delete tag");
    } finally {
      setTagDeleting(false);
    }
  };

  // --- Custom Field Operations ---
  const isDuplicateField = (name: string, exceptId?: string): boolean => {
    const lower = name.toLowerCase();
    return fields.some(
      (f) => f.id !== exceptId && f.name.toLowerCase() === lower
    );
  };

  const handleCreateField = async () => {
    const name = newFieldName.trim();
    if (!name) return;
    if (!workspace?.id || !profile?.id) {
      toast.error("Session information not found");
      return;
    }
    if (isDuplicateField(name)) {
      toast.error(`A field named "${name}" already exists.`);
      return;
    }

    try {
      setFieldCreating(true);
      const { error } = await supabase.from("custom_field_schemas").insert({
        workspace_id: workspace.id,
        created_by: profile.id,
        name: name,
        type: "text",
      });

      if (error) throw error;

      toast.success(`Created field "${name}"`);
      setNewFieldName("");
      await fetchFields(workspace.id);
    } catch (err) {
      console.error("Field creation error:", err);
      toast.error("Failed to create custom field");
    } finally {
      setFieldCreating(false);
    }
  };

  const handleRenameField = async (field: any, nextName: string) => {
    const name = nextName.trim();
    if (!name || name === field.name) return;
    if (isDuplicateField(name, field.id)) {
      toast.error(`A field named "${name}" already exists.`);
      return;
    }

    try {
      setBusyFieldId(field.id);
      const { error } = await supabase
        .from("custom_field_schemas")
        .update({ name: name })
        .eq("id", field.id);

      if (error) throw error;
      toast.success(`Renamed to "${name}"`);
      await fetchFields(workspace.id);
    } catch (err) {
      console.error("Rename field error:", err);
      toast.error("Failed to rename field");
    } finally {
      setBusyFieldId(null);
    }
  };

  const handleDeleteField = async (field: any) => {
    if (!window.confirm(`Delete field "${field.name}"? This removes its stored value on every contact and cannot be undone.`)) {
      return;
    }

    try {
      setBusyFieldId(field.id);
      const { error } = await supabase
        .from("custom_field_schemas")
        .delete()
        .eq("id", field.id);

      if (error) throw error;
      toast.success(`Deleted field "${field.name}"`);
      await fetchFields(workspace.id);
    } catch (err) {
      console.error("Delete field error:", err);
      toast.error("Failed to delete field");
    } finally {
      setBusyFieldId(null);
    }
  };

  return (
    <div className="max-w-[800px] animate-in fade-in-50 duration-200 space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900 mb-1">Fields & Tags</h1>
        <p className="text-[14px] text-gray-500">
          Organize your inbox contacts using color-coded tags and structured custom fields.
        </p>
      </div>

      {/* Tags Section */}
      <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-5">
        <div className="border-b border-border pb-3 flex items-center gap-2">
          <TagIcon className="size-4 text-primary" />
          <h3 className="text-[15px] font-semibold text-gray-900">Tags Configuration</h3>
        </div>

        {tagsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition-all"
                    style={{
                      backgroundColor: `${tag.color}15`,
                      color: tag.color,
                      borderColor: `${tag.color}30`,
                    }}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                    {canEditSettings && (
                      <button
                        onClick={() => setTagToDelete(tag)}
                        className="ml-1 hover:bg-black/5 rounded-full p-0.5 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No tags defined yet.</p>
            )}

            {canEditSettings && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <input
                  type="text"
                  placeholder="e.g. VIP Customer"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  disabled={tagSaving}
                  className="flex-1 min-w-[200px] border border-border rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={`size-6 rounded-md transition-all hover:scale-105 ${
                        selectedColor === color.value ? "ring-2 ring-primary ring-offset-2 scale-105" : ""
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
                <button
                  onClick={handleCreateTag}
                  disabled={tagSaving || !newTagName.trim()}
                  className="flex items-center gap-1 px-4 py-2 border border-border bg-white hover:bg-gray-100 text-[13px] font-semibold text-gray-900 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {tagSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Add Tag
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Fields Section */}
      <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-5">
        <div className="border-b border-border pb-3 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <h3 className="text-[15px] font-semibold text-gray-900">Custom Contact Fields</h3>
        </div>

        {fieldsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-border rounded-lg overflow-hidden bg-gray-100/10">
              {fields.length === 0 ? (
                <p className="p-6 text-center text-xs text-gray-500 bg-white">No custom fields defined yet.</p>
              ) : (
                <ul className="divide-y divide-border bg-white">
                  {fields.map((field) => (
                    <li key={field.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={field.name}
                        disabled={busyFieldId === field.id || !canEditSettings}
                        onBlur={(e) => handleRenameField(field, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="flex-1 bg-transparent text-[13px] border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-colors font-medium disabled:hover:border-transparent disabled:cursor-not-allowed"
                      />
                      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-border">
                        {field.type}
                      </span>
                      {canEditSettings && (
                        <button
                          onClick={() => handleDeleteField(field)}
                          disabled={busyFieldId === field.id}
                          className="text-gray-500 hover:text-red-600 transition-colors p-1"
                        >
                          {busyFieldId === field.id ? (
                            <Loader2 className="size-4 animate-spin text-gray-500" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canEditSettings && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Lead Source"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateField()}
                  disabled={fieldCreating}
                  className="flex-1 border border-border rounded-lg px-3.5 py-2 text-[13px] bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleCreateField}
                  disabled={fieldCreating || !newFieldName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white font-semibold text-[13px] rounded-lg shadow-sm disabled:opacity-50 shrink-0"
                >
                  {fieldCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Add Field
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Tag Modal */}
      {tagToDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTagToDelete(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-gray-900 mb-2">Delete Tag</h3>
            <p className="text-[13px] text-gray-500 mb-5">
              Are you sure you want to delete the tag <strong>&quot;{tagToDelete.name}&quot;</strong>? This will remove it from all contacts and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setTagToDelete(null)}
                className="flex-1 py-2 border border-border rounded-lg text-[13px] font-medium text-gray-900 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTag}
                disabled={tagDeleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-all flex items-center justify-center"
              >
                {tagDeleting ? <Loader2 className="size-4 animate-spin" /> : "Delete tag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
