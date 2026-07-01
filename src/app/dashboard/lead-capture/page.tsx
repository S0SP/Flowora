import { LeadCaptureClient } from "@/components/lead-capture/lead-capture-client";
import { PageShell, PageHeader } from "@/components/ui";
import { Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeadCapturePage() {
  return (
    <PageShell>
      <PageHeader
        icon={Zap}
        title="Lead Capture"
        description="Listen to live Google Sheets and send automated WhatsApp templates to new leads."
      />

      <LeadCaptureClient />
    </PageShell>
  );
}
