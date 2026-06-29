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

  const { data: call, error: dbError } = await supabase
    .from("voice_calls")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
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
    .from("voice_calls")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (dbError || !call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (call.livekit_room_name) {
    try {
      const { roomService } = await getLiveKitClients();
      await roomService.deleteRoom(call.livekit_room_name);
    } catch (e) {
      console.error("Failed to delete room in LiveKit:", e);
    }
  }

  await supabase
    .from("voice_calls")
    .update({ status: "ended" })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
