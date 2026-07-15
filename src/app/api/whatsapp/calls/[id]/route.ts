import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveKitClients } from "@/lib/livekit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the contact belongs to the user's workspace
  const { data: call, error: dbError } = await supabase
    .from("whatsapp_calls")
    .select("*, contacts(workspace_id)")
    .eq("id", id)
    .single();

  if (dbError || !call) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ call });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: call, error: dbError } = await supabase
    .from("whatsapp_calls")
    .select("*")
    .eq("id", id)
    .single();

  if (dbError || !call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (call.meta_call_id) {
    try {
      const { roomService } = await getLiveKitClients();
      await roomService.deleteRoom(call.meta_call_id);
    } catch (e) {
      console.error("Failed to delete WhatsApp room in LiveKit:", e);
    }
  }

  await supabase
    .from("whatsapp_calls")
    .update({ 
      status: "terminated", 
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
