import { LeadCaptureClient } from "@/components/lead-capture/lead-capture-client";
import { PageShell, PageHeader } from "@/components/ui";
import { Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeadCapturePage() {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-8 h-full">
      <div className="shrink-0 mb-6">
        <PageHeader
          icon={Zap}
          title="Lead Capture"
          description="Listen to live Google Sheets and send automated WhatsApp templates to new leads."
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <LeadCaptureClient />
      </div>
    </div>
  );
}
