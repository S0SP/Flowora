import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const [
      { count: totalContacts },
      { count: newContactsToday },
      { count: totalCampaigns },
      { count: activeCampaigns },
      { data: messages },
      { data: todayMessages },
      { count: openThreads },
      { count: totalThreads },
      { count: aiResolvedToday },
      { data: voiceCalls },
      { count: totalKnowledgeChunks },
    ] = await Promise.all([
      admin.from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      admin.from("contacts").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).gte("created_at", todayStart.toISOString()),
      admin.from("campaigns").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      admin.from("campaigns").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "active"),
      admin.from("messages").select("status, sender_type, created_at").eq("workspace_id", workspaceId).gte("created_at", weekStart.toISOString()),
      admin.from("messages").select("status, sender_type").eq("workspace_id", workspaceId).gte("created_at", todayStart.toISOString()),
      admin.from("threads").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "open"),
      admin.from("threads").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      admin.from("messages").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("sender_type", "bot").gte("created_at", todayStart.toISOString()),
      admin.from("voice_calls").select("status, duration_seconds, cost_inr").eq("workspace_id", workspaceId).gte("created_at", monthStart.toISOString()),
      admin.from("knowledge_chunks").select("*", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    ]);

    const msgList = messages ?? [];
    const todayMsgList = todayMessages ?? [];
    const callList = voiceCalls ?? [];

    // Message stats
    const totalMessages = msgList.length;
    const deliveredMessages = msgList.filter(m => ["delivered", "read"].includes(m.status ?? "")).length;
    const readMessages = msgList.filter(m => m.status === "read").length;
    const botMessages = todayMsgList.filter(m => m.sender_type === "bot").length;
    const agentMessages = todayMsgList.filter(m => m.sender_type === "agent").length;

    // Daily message trend (last 7 days)
    const dailyTrend: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dailyTrend[d.toISOString().slice(0, 10)] = 0;
    }
    msgList.forEach(m => {
      const day = m.created_at?.slice(0, 10);
      if (day && dailyTrend[day] !== undefined) dailyTrend[day]++;
    });

    // Voice stats
    const completedCalls = callList.filter(c => c.status === "completed");
    const totalVoiceMins = completedCalls.reduce((s, c) => s + Math.ceil((c.duration_seconds ?? 0) / 60), 0);
    const totalVoiceCost = callList.reduce((s, c) => s + (c.cost_inr ?? 0), 0);

    return NextResponse.json({
      contacts: {
        total: totalContacts ?? 0,
        new_today: newContactsToday ?? 0,
      },
      campaigns: {
        total: totalCampaigns ?? 0,
        active: activeCampaigns ?? 0,
      },
      messages: {
        total_week: totalMessages,
        delivered_week: deliveredMessages,
        read_week: readMessages,
        delivery_rate: totalMessages > 0 ? Math.round((deliveredMessages / totalMessages) * 100) : 0,
        read_rate: totalMessages > 0 ? Math.round((readMessages / totalMessages) * 100) : 0,
        bot_today: botMessages,
        agent_today: agentMessages,
        daily_trend: Object.entries(dailyTrend).map(([date, count]) => ({ date, count })),
      },
      inbox: {
        open_threads: openThreads ?? 0,
        total_threads: totalThreads ?? 0,
        ai_resolved_today: aiResolvedToday ?? 0,
      },
      voice: {
        total_calls_month: callList.length,
        completed_calls: completedCalls.length,
        total_minutes: totalVoiceMins,
        total_cost_inr: Math.round(totalVoiceCost * 100) / 100,
      },
      knowledge: {
        total_chunks: totalKnowledgeChunks ?? 0,
      },
    });
  } catch (err) {
    console.error("[analytics GET]", err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
