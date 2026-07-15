import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ws = searchParams.get("ws");
    if (!ws) {
      return NextResponse.json({ error: "Missing ws parameter" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Check if web widget is enabled in chatbot settings
    const { data: chatbot } = await supabase
      .from("chatbot_settings")
      .select("web_widget_enabled")
      .eq("workspace_id", ws)
      .maybeSingle();

    if (!chatbot?.web_widget_enabled) {
      return NextResponse.json({ error: "Web widget is disabled for this workspace" }, { status: 403 });
    }

    const { data: wsSettings } = await supabase
      .from("workspace_settings")
      .select("chat_widget")
      .eq("workspace_id", ws)
      .maybeSingle();

    return NextResponse.json({
      config: wsSettings?.chat_widget ?? {},
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
