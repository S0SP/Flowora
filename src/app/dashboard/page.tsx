import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/analytics/stat-card";
import {
  MessageSquare, Users, Megaphone, TrendingUp, CheckCheck, XCircle, Activity,
  Zap
} from "lucide-react";
import { formatPercent } from "@/lib/utils";
import { RecentCampaigns } from "@/components/campaign/recent-campaigns";
import { PageShell, PageHeader } from "@/components/ui";

async function getOverviewStats() {
  const supabase = await createClient();

  const [
    { count: totalMessages },
    { count: totalContacts },
    { count: totalCampaigns },
    { data: statusCounts },
  ] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("campaigns").select("*", { count: "exact", head: true }),
    supabase.from("messages").select("status"),
  ]);

  const delivered = statusCounts?.filter(m => m.status === "delivered").length ?? 0;
  const read = statusCounts?.filter(m => m.status === "read").length ?? 0;
  const failed = statusCounts?.filter(m => m.status === "failed").length ?? 0;
  const total = statusCounts?.length ?? 1;

  return {
    totalMessages: totalMessages ?? 0,
    totalContacts: totalContacts ?? 0,
    totalCampaigns: totalCampaigns ?? 0,
    deliveredRate: (delivered / total) * 100,
    readRate: (read / total) * 100,
    failedRate: (failed / total) * 100,
  };
}

export default async function DashboardPage() {
  const stats = await getOverviewStats();

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <PageShell>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{greeting}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your campaigns today.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-full">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span>System Operational</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="Total Messages"
          value={stats.totalMessages.toLocaleString()}
          icon={MessageSquare}
          className="col-span-2 xl:col-span-1"
        />
        <StatCard
          label="Contacts"
          value={stats.totalContacts.toLocaleString()}
          icon={Users}
          variant="info"
        />
        <StatCard
          label="Campaigns"
          value={stats.totalCampaigns.toLocaleString()}
          icon={Megaphone}
        />
        <StatCard
          label="Delivered"
          value={formatPercent(stats.deliveredRate)}
          icon={CheckCheck}
          variant="success"
          trendLabel="vs last 7 days"
        />
        <StatCard
          label="Read Rate"
          value={formatPercent(stats.readRate)}
          icon={TrendingUp}
          variant="info"
          trendLabel="of delivered messages"
        />
        <StatCard
          label="Failed"
          value={formatPercent(stats.failedRate)}
          icon={XCircle}
          variant="danger"
          trendLabel="delivery failures"
        />
      </div>

      {/* Recent Campaigns */}
      <RecentCampaigns />
    </PageShell>
  );
}
