import { LeadCaptureClient } from "@/components/lead-capture/lead-capture-client";

export const dynamic = "force-dynamic";

export default async function LeadCapturePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Lead Capture Confirm</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Listen to live Google Sheets and send automated WhatsApp templates to new leads.
        </p>
      </div>

      <LeadCaptureClient />
    </div>
  );
}
