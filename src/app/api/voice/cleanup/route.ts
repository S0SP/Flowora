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

// GET /api/voice/cleanup — list ALL active rooms + stuck DB records
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomService } = await getLiveKitClients();

    // List ALL rooms — no prefix filter so we catch anything
    const allRooms = await roomService.listRooms();
    const callRooms = allRooms.filter(r =>
      r.name.startsWith("call-") || r.name.startsWith("inbound-")
    );

    // Also check DB for records stuck in non-terminal states
    const admin = await createAdminClient();
    const { data: stuckRecords } = await admin
      .from("voice_calls")
      .select("id, phone_number, status, created_at, livekit_room_name")
      .in("status", ["initiated", "ringing", "active"])
      .order("created_at", { ascending: false });

    return NextResponse.json({
      // LiveKit rooms (only these can be killed via the Kill button)
      active_rooms: callRooms.length,
      rooms: callRooms.map(r => ({
        name: r.name,
        num_participants: r.numParticipants,
        created_at: r.creationTime ? new Date(Number(r.creationTime) * 1000).toISOString() : null,
      })),
      // DB records that never reached a terminal state
      stuck_db_records: stuckRecords?.length ?? 0,
      db_details: stuckRecords ?? [],
      // Note: if active_rooms=0 but Voicelink still says "channel limit exceeded",
      // the SIP session is stuck on Voicelink's side (not visible here).
      // Fix: Voicelink admin panel → Active Sessions → Force Terminate.
      note: callRooms.length === 0
        ? "LiveKit is clean. If Voicelink still shows channel limit errors, go to Voicelink admin → Active Calls and force-terminate any stuck session."
        : `${callRooms.length} room(s) found — use the Kill button to free SIP channels.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
