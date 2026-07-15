import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";
import { z } from "zod";

// GET — list team members
export async function GET() {
  try {
    const { workspaceId } = await getTenant();
    const admin = await createAdminClient();

    const { data: members, error } = await admin
      .from("workspace_members")
      .select(`
        id, role, status, email, full_name, avatar_url,
        monthly_credit_limit, max_concurrent_chats, created_at,
        last_seen_at, user_id
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Get stats per member
    const userIds = (members ?? []).filter(m => m.user_id).map(m => m.user_id);

    // Get today's message counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayMessages } = await admin
      .from("messages")
      .select("sender_id")
      .eq("workspace_id", workspaceId)
      .eq("sender_type", "agent")
      .gte("created_at", today.toISOString())
      .in("sender_id", userIds);

    const todayCountMap = (todayMessages ?? []).reduce<Record<string, number>>((acc, m) => {
      if (m.sender_id) acc[m.sender_id] = (acc[m.sender_id] ?? 0) + 1;
      return acc;
    }, {});

    // Get assigned chats count per member
    const { data: assignedThreads } = await admin
      .from("threads")
      .select("assigned_to")
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .in("assigned_to", userIds);

    const assignedMap = (assignedThreads ?? []).reduce<Record<string, number>>((acc, t) => {
      if (t.assigned_to) acc[t.assigned_to] = (acc[t.assigned_to] ?? 0) + 1;
      return acc;
    }, {});

    const enriched = (members ?? []).map(m => ({
      ...m,
      chats_today: m.user_id ? (todayCountMap[m.user_id] ?? 0) : 0,
      assigned_chats: m.user_id ? (assignedMap[m.user_id] ?? 0) : 0,
    }));

    return NextResponse.json({ members: enriched });
  } catch (err) {
    console.error("[team GET]", err);
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}

// POST — invite a new team member
const inviteSchema = z.object({
  email: z.string().email("Valid email required"),
  full_name: z.string().min(2, "Name is required"),
  role: z.enum(["agent", "manager", "admin"]),
  monthly_credit_limit: z.number().optional(),
  max_concurrent_chats: z.number().min(1).max(100).default(20),
});

export async function POST(req: NextRequest) {
  try {
    const { workspaceId, userId, role: currentRole } = await getTenant();

    // Only admins/owners can invite
    if (!["owner", "admin"].includes(currentRole)) {
      return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { email, full_name, role, monthly_credit_limit, max_concurrent_chats } = parsed.data;
    const admin = await createAdminClient();

    // Check if already a member
    const { data: existing } = await admin
      .from("workspace_members")
      .select("id, status")
      .eq("workspace_id", workspaceId)
      .eq("email", email)
      .single();

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json({ error: "This email is already a workspace member" }, { status: 409 });
      }
      // Re-invite
      await admin.from("workspace_members").update({
        role, status: "invited", updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      return NextResponse.json({ ok: true, message: "Invitation resent" });
    }

    // Check if user already has a Supabase account by listing users
    const { data: { users } } = await admin.auth.admin.listUsers()
    const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    let invitedUserId: string | null = null;

    if (existingUser) {
      invitedUserId = existingUser.id;
    }

    // Create member record
    const { data: member, error: memberErr } = await admin
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        user_id: invitedUserId,
        email,
        full_name,
        role,
        status: "invited",
        monthly_credit_limit: monthly_credit_limit ?? null,
        max_concurrent_chats,
        invited_by: userId,
      })
      .select()
      .single();

    if (memberErr) throw memberErr;

    // Send invite email (if Supabase email configured)
    if (!invitedUserId) {
      try {
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name, workspace_id: workspaceId, role },
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?workspace=${workspaceId}`,
        });
      } catch (inviteErr) {
        console.warn("[team invite] Email invite failed:", inviteErr);
        // Don't fail the request — member record is created
      }
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("[team POST]", err);
    return NextResponse.json({ error: "Failed to invite member" }, { status: 500 });
  }
}

// PATCH — update member role/settings
export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId, role: currentRole } = await getTenant();

    if (!["owner", "admin"].includes(currentRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { memberId, role, status, monthly_credit_limit, max_concurrent_chats } = body;

    if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

    const admin = await createAdminClient();
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (role !== undefined) update.role = role;
    if (status !== undefined) update.status = status;
    if (monthly_credit_limit !== undefined) update.monthly_credit_limit = monthly_credit_limit;
    if (max_concurrent_chats !== undefined) update.max_concurrent_chats = max_concurrent_chats;

    const { data, error } = await admin
      .from("workspace_members")
      .update(update)
      .eq("id", memberId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ member: data });
  } catch (err) {
    console.error("[team PATCH]", err);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

// DELETE — remove a team member
export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId, role: currentRole } = await getTenant();

    if (!["owner", "admin"].includes(currentRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("memberId");
    if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

    const admin = await createAdminClient();

    // Prevent removing the owner
    const { data: member } = await admin
      .from("workspace_members")
      .select("role")
      .eq("id", memberId)
      .eq("workspace_id", workspaceId)
      .single();

    if (member?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 403 });
    }

    await admin.from("workspace_members").delete().eq("id", memberId).eq("workspace_id", workspaceId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[team DELETE]", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
