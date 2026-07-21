import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

// POST — assign a thread to an agent, toggle AI, or close/reopen
export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId } = await getTenant();
    const body = await req.json();
    const { threadId, agentId, action } = body;

    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

    const admin = await createAdminClient();

    // Verify thread belongs to workspace
    const { data: thread } = await admin
      .from("threads")
      .select("id, ai_active, assigned_to, status")
      .eq("id", threadId)
      .eq("workspace_id", workspaceId)
      .single();

    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

    const update: Record<string, any> = { updated_at: new Date().toISOString() };

    switch (action) {
      case "assign":
        if (!agentId) return NextResponse.json({ error: "agentId required for assign" }, { status: 400 });
        update.assigned_to = agentId;
        update.ai_active = false; // Disable AI when assigned to human
        break;

      case "unassign":
        update.assigned_to = null;
        break;

      case "enable_ai":
        update.ai_active = true;
        update.assigned_to = null;
        break;

      case "disable_ai":
        update.ai_active = false;
        break;

      case "close":
        update.status = "closed";
        update.ai_active = false;
        break;

      case "reopen":
        update.status = "open";
        update.unread_count = 0;
        break;

      case "mark_read":
        update.unread_count = 0;
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const { data, error } = await admin
      .from("threads")
      .update(update)
      .eq("id", threadId)
      .select()
      .single();

    if (error) throw error;

    // Log assignment change as a system message
    if (action === "assign" || action === "unassign") {
      let content = "";
      if (action === "assign") {
        const { data: member } = await admin
          .from("workspace_members")
          .select("full_name, email")
          .eq("user_id", agentId)
          .eq("workspace_id", workspaceId)
          .single();
        const assigneeName = member?.full_name ?? member?.email ?? "agent";
        content = `Conversation assigned to ${assigneeName}`;

        // Send notification to the assignee if assigned by someone else
        if (agentId !== userId) {
          const { data: assigner } = await admin
            .from("workspace_members")
            .select("full_name, email")
            .eq("user_id", userId)
            .eq("workspace_id", workspaceId)
            .single();
          
          const assignerName = assigner?.full_name ?? assigner?.email ?? "A team member";
          const { Notify } = await import("@/services/notifications");
          await Notify.conversationAssigned(workspaceId, agentId, assignerName);
          await Notify.conversationAssignedToOther(workspaceId, userId, assigneeName);
        }
      } else {
        content = "Conversation unassigned";
      }

      await admin.from("messages").insert({
        workspace_id: workspaceId,
        thread_id: threadId,
        content,
        type: "text",
        sender_type: "system",
        status: "delivered",
        metadata: { action, agent_id: agentId ?? null, by: userId },
      });
    }

    return NextResponse.json({ thread: data });
  } catch (err) {
    console.error("[inbox/assign POST]", err);
    return NextResponse.json({ error: "Failed to update thread" }, { status: 500 });
  }
}
