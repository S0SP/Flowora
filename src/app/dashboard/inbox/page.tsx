import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/chat/inbox-client";
import { PageShell, PageHeader } from "@/components/ui";
import { Inbox } from "lucide-react";

export default async function InboxPage() {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);

  return (
    <PageShell>
      <PageHeader
        icon={Inbox}
        title="Inbox"
        description="Incoming messages from all channels"
      />
      <InboxClient initialContacts={contacts ?? []} />
    </PageShell>
  );
}
