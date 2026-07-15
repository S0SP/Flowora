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
