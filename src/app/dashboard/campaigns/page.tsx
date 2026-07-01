import { createClient } from "@/lib/supabase/server";
import { CampaignSender } from "@/components/campaign/campaign-sender";
import { CampaignTable } from "@/components/campaign/campaign-table";
import { PageShell, PageHeader } from "@/components/ui";
import { Megaphone } from "lucide-react";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <PageShell>
      <PageHeader
        icon={Megaphone}
        title="Campaigns"
        description="Send bulk WhatsApp messages using templates"
        action={<CampaignSender />}
      />

      <CampaignTable campaigns={campaigns ?? []} />
    </PageShell>
  );
}
