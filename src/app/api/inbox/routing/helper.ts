export async function applyRoutingRules(opts: {
  workspaceId: string;
  threadId: string;
  message: string;
  contactId: string;
  admin: any;
}): Promise<void> {
  try {
    const { data: rules } = await opts.admin
      .from("inbox_routing_rules")
      .select("*")
      .eq("workspace_id", opts.workspaceId)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (!rules?.length) return;

    const msgLower = opts.message.toLowerCase();

    for (const rule of rules) {
      let matched = false;

      if (rule.rule_type === "keyword") {
        const keywords: string[] = rule.conditions?.keywords ?? [];
        matched = keywords.some((kw: string) => msgLower.includes(kw.toLowerCase()));
      } else if (rule.rule_type === "round_robin" || rule.rule_type === "least_active") {
        matched = true; // Always apply these
      }

      if (!matched) continue;

      const action = rule.action ?? {};

      if (action.type === "assign_agent" && action.agentId) {
        await opts.admin.from("threads").update({
          assigned_to: action.agentId,
          ai_active: action.disableAi ?? false,
        }).eq("id", opts.threadId);
        break;
      } else if (action.type === "round_robin" && action.agentIds?.length) {
        // Count current open threads per agent to pick least loaded
        const { data: openCounts } = await opts.admin
          .from("threads")
          .select("assigned_to")
          .eq("workspace_id", opts.workspaceId)
          .eq("status", "open")
          .in("assigned_to", action.agentIds);

        const countMap = (openCounts ?? []).reduce((acc: Record<string, number>, t: any) => {
          acc[t.assigned_to] = (acc[t.assigned_to] ?? 0) + 1;
          return acc;
        }, {});

        const leastLoaded = action.agentIds.reduce((min: string, id: string) =>
          (countMap[id] ?? 0) < (countMap[min] ?? 0) ? id : min
        );

        if (leastLoaded) {
          await opts.admin.from("threads").update({
            assigned_to: leastLoaded,
            ai_active: false,
          }).eq("id", opts.threadId);
        }
        break;
      }
    }
  } catch (err: any) {
    console.error("[routing] applyRoutingRules error:", err.message);
  }
}
