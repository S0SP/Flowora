import { createClient } from "@/lib/supabase/server";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { PageShell, PageHeader } from "@/components/ui";
import { Users } from "lucide-react";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: contacts, count } = await supabase
    .from("contacts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title="Contacts"
        description={`${count ?? 0} total contacts`}
      />

      <ContactsTable contacts={contacts ?? []} />
    </PageShell>
  );
}
