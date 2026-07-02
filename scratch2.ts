import { createAdminClient } from "./src/lib/supabase/server";
import { RoomServiceClient } from "livekit-server-sdk";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function forceClean() {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("chatbot_settings").select("livekit_url, livekit_api_key, livekit_api_secret").single();
  
  const url = data?.livekit_url || process.env.LIVEKIT_URL!;
  const key = data?.livekit_api_key || process.env.LIVEKIT_API_KEY!;
  const secret = data?.livekit_api_secret || process.env.LIVEKIT_API_SECRET!;
  
  if (!url || !key || !secret) {
    console.log("No API keys found.");
    return;
  }

  const roomService = new RoomServiceClient(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret);
  const rooms = await roomService.listRooms();
  console.log("Active Rooms found:", rooms.map(r => r.name));

  for (const r of rooms) {
    console.log(`Force deleting room: ${r.name}`);
    await roomService.deleteRoom(r.name);
  }
  console.log("Done.");
}
forceClean().catch(console.error);
