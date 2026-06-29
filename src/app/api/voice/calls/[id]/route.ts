import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: call, error: dbError } = await supabase
    .from("voice_calls")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (dbError || !call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ call });
}
