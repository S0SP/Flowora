"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/context/WorkspaceContext";
import { CURRENCIES } from "@/lib/currency";

export function DealsSettingsPanel() {
  const supabase = createClient();
  const { workspace, member } = useWorkspace();
  const canEditSettings = member.role === "owner" || member.role === "admin";

  const [loading, setLoading] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [initialCurrency, setInitialCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadWorkspaceCurrency() {
      if (!workspace?.id) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("workspaces")
          .select("default_currency")
          .eq("id", workspace.id)
          .single();

        if (error) throw error;
        const curr = data?.default_currency || "USD";
        setSelectedCurrency(curr);
        setInitialCurrency(curr);
      } catch (err) {
        console.error("Failed to load default currency:", err);
      } finally {
        setLoading(false);
      }
    }

    loadWorkspaceCurrency();
  }, [workspace?.id, supabase]);

  const dirty = selectedCurrency !== initialCurrency;

  const handleSave = async () => {
    if (!workspace?.id || !dirty) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from("workspaces")
        .update({ default_currency: selectedCurrency })
        .eq("id", workspace.id);

      if (error) throw error;

      setInitialCurrency(selectedCurrency);
      toast.success("Default currency updated successfully!");
    } catch (err) {
      console.error("Save default currency error:", err);
      toast.error("Failed to save default currency settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[800px] animate-in fade-in-50 duration-200 space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900 mb-1">Deals & Currency Settings</h1>
        <p className="text-[14px] text-gray-500">
          Configure default currency settings for deals, pipelines, and dashboard reporting.
        </p>
      </div>

      <div className="bg-white border border-border rounded-xl p-6 shadow-sm space-y-5">
        <div className="border-b border-border pb-3 flex items-center gap-2">
          <Coins className="size-4 text-primary" />
          <h3 className="text-[15px] font-semibold text-gray-900">Default Workspace Currency</h3>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            New deals created inside the workspace will default to this currency. Existing deals will preserve their saved currency. All pipeline and dashboard metrics aggregate based on this choice.
          </p>

          <div className="grid gap-2 sm:max-w-xs">
            <label className="text-[13px] font-semibold text-gray-900">Currency Code</label>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              disabled={!canEditSettings}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label} ({c.symbol})
                </option>
              ))}
            </select>
            {!canEditSettings && (
              <p className="text-[11px] text-gray-500 mt-1">
                Only workspace owners and admins can modify default currency settings.
              </p>
            )}
          </div>

          {canEditSettings && (
            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="px-6 py-2 bg-primary hover:bg-primary/95 text-white font-semibold text-[13px] rounded-lg shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Currency Settings"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
