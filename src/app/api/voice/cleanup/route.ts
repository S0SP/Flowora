import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getLiveKitClients } from "@/lib/livekit";

// POST /api/voice/cleanup
// Kills ALL active LiveKit rooms (releasing stuck SIP trunk channels)
// and marks any stuck call records as failed.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomService } = await getLiveKitClients();

    // 1. List all active rooms
    const rooms = await roomService.listRooms();
    const callRooms = rooms.filter(r => r.name.startsWith("call-") || r.name.startsWith("inbound-"));

    // 2. Delete each room — this forces SIP trunk to release the channel
    const results: { room: string; status: string }[] = [];
    for (const room of callRooms) {
      try {
        await roomService.deleteRoom(room.name);
        results.push({ room: room.name, status: "deleted" });
      } catch (e: any) {
        results.push({ room: room.name, status: `error: ${e.message}` });
      }
    }

    // 3. Mark stuck call records as failed in DB
    const admin = await createAdminClient();
    const { data: fixedRows } = await admin
      .from("voice_calls")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .in("status", ["initiated", "ringing", "active"])
      .eq("user_id", user.id)
      .select("id");

    return NextResponse.json({
      ok: true,
      rooms_killed: results.length,
      db_records_fixed: fixedRows?.length ?? 0,
      details: results,
    });
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/voice/cleanup — list active rooms without killing them
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomService } = await getLiveKitClients();
    const rooms = await roomService.listRooms();
    const callRooms = rooms.filter(r => r.name.startsWith("call-") || r.name.startsWith("inbound-"));

    return NextResponse.json({
      active_rooms: callRooms.length,
      rooms: callRooms.map(r => ({
        name: r.name,
        num_participants: r.numParticipants,
        created_at: r.creationTime ? new Date(Number(r.creationTime) * 1000).toISOString() : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
