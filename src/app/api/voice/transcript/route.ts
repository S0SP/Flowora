import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { call_id, phone, transcript, status } = body;

    const supabase = await createAdminClient();

    if (call_id) {
      await supabase
        .from("voice_calls")
        .update({
          transcript: transcript,
          updated_at: new Date().toISOString()
        })
        .eq("id", call_id);
    } else if (phone) {
      // Fallback: match by phone and most recent initiated/ringing/active call
      const { data: calls } = await supabase
        .from("voice_calls")
        .select("id")
        .eq("phone_number", phone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (calls && calls.length > 0) {
        await supabase
          .from("voice_calls")
          .update({
            transcript: transcript,
            updated_at: new Date().toISOString()
          })
          .eq("id", calls[0].id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Transcript Webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
