import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("*").single();
  
  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: data || {} });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    // Upsert logic - fetch existing first to keep the singleton ID if present
    const { data: existing } = await supabase.from("app_settings").select("id").single();
    
    const payload = {
      ...body,
      updated_at: new Date().toISOString()
    };
    
    if (existing?.id) {
      payload.id = existing.id;
    }

    const { data, error } = await supabase
      .from("app_settings")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();

    if (error) throw error;
    
    return NextResponse.json({ success: true, keys: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
