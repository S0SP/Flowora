import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TicketDetailClient } from "@/components/tickets/ticket-detail-client";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  return <TicketDetailClient ticketId={id} currentUserId={user.id} />;
}
