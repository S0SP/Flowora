import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { call_id, phone, transcript, status, duration_seconds, cost_breakdown } = body;

    const supabase = await createAdminClient();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (transcript !== undefined)      updatePayload.transcript        = transcript;
    if (duration_seconds !== undefined) updatePayload.duration_seconds  = duration_seconds;
    if (cost_breakdown !== undefined)  updatePayload.cost_breakdown    = cost_breakdown;
    if (status === "COMPLETED")        updatePayload.status            = "completed";

    if (call_id) {
      const { data: voiceCall } = await supabase
        .from("voice_calls")
        .select("id")
        .eq("id", call_id)
        .maybeSingle();

      if (voiceCall) {
        await supabase.from("voice_calls").update(updatePayload).eq("id", call_id);
      } else {
        const waPayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (transcript !== undefined)      waPayload.transcript_text   = transcript;
        if (duration_seconds !== undefined) waPayload.duration_seconds  = duration_seconds;
        if (status === "COMPLETED")        waPayload.status            = "terminated";

        await supabase.from("whatsapp_calls").update(waPayload).eq("id", call_id);
      }
    } else if (phone) {
      // Fallback: match by phone number (to_number column) and most recent call
      const { data: calls } = await supabase
        .from("voice_calls")
        .select("id")
        .eq("phone_number", phone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (calls && calls.length > 0) {
        await supabase.from("voice_calls").update(updatePayload).eq("id", calls[0].id);
      } else {
        const { data: waCalls } = await supabase
          .from("whatsapp_calls")
          .select("id")
          .eq("phone_number", phone)
          .order("created_at", { ascending: false })
          .limit(1);

        if (waCalls && waCalls.length > 0) {
          const waPayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (transcript !== undefined)      waPayload.transcript_text   = transcript;
          if (duration_seconds !== undefined) waPayload.duration_seconds  = duration_seconds;
          if (status === "COMPLETED")        waPayload.status            = "terminated";

          await supabase.from("whatsapp_calls").update(waPayload).eq("id", waCalls[0].id);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Transcript webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
