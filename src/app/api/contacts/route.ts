import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const supabase = await createAdminClient();

    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    return NextResponse.json({ contacts: data, total: count });
  } catch (err: any) {
    console.error("[contacts GET]", err?.message ?? err);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const supabase = await createAdminClient();

    const isArray = Array.isArray(body);
    const rawContacts = isArray ? body : [body];

    const contactsToInsert = rawContacts.map((c: any) => {
      const nameVal = c.name || c.full_name || "Unknown";
      return {
        workspace_id: workspaceId,
        phone: c.phone,
        name: nameVal,
        full_name: nameVal,
        email: c.email || null,
        company: c.company || null,
        status: c.status || "Lead",
        tags: Array.isArray(c.tags) ? c.tags : c.tags ? String(c.tags).split(",").map(t => t.trim()).filter(Boolean) : [],
        custom_fields: c.custom_fields || {},
        last_message_at: new Date().toISOString()
      };
    }).filter(c => c.phone);

    if (contactsToInsert.length === 0) {
      return NextResponse.json({ error: "No valid contacts provided" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("contacts")
      .upsert(contactsToInsert, { onConflict: "phone" })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, contacts: data });
  } catch (err: any) {
    console.error("[contacts POST]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Failed to save contacts" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Contact ID is required" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    const payload: any = {};
    if (updates.name !== undefined) {
      payload.name = updates.name;
      payload.full_name = updates.name;
    }
    if (updates.full_name !== undefined) {
      payload.name = updates.full_name;
      payload.full_name = updates.full_name;
    }
    if (updates.email !== undefined) payload.email = updates.email || null;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.company !== undefined) payload.company = updates.company || null;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.tags !== undefined) {
      payload.tags = Array.isArray(updates.tags)
        ? updates.tags
        : typeof updates.tags === "string"
        ? updates.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
    }
    if (updates.custom_fields !== undefined) payload.custom_fields = updates.custom_fields;

    const { data, error } = await supabase
      .from("contacts")
      .update(payload)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, contact: data });
  } catch (err: any) {
    console.error("[contacts PATCH]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Failed to update contact" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { workspaceId } = await getTenant();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const supabase = await createAdminClient();

    if (id) {
      // Single delete
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);

      if (error) throw error;
    } else {
      // Bulk delete
      const body = await req.json();
      const { ids } = body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "Contact ID(s) required" }, { status: 400 });
      }

      const { error } = await supabase
        .from("contacts")
        .delete()
        .in("id", ids)
        .eq("workspace_id", workspaceId);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[contacts DELETE]", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Failed to delete contact(s)" }, { status: 500 });
  }
}
