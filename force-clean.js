import { RoomServiceClient } from "livekit-server-sdk";

async function forceClean() {
  // Uses environment variables directly
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !secret) {
      console.log("No env vars found, assuming the kill switch already did this part.");
      return;
  }

  const roomService = new RoomServiceClient(url.replace(/^wss:/, "https:").replace(/^ws:/, "http:"), key, secret);
  const rooms = await roomService.listRooms();
  console.log("Active Rooms found:", rooms.map(r => r.name));

  for (const r of rooms) {
    console.log(`Force deleting room: ${r.name}`);
    await roomService.deleteRoom(r.name);
  }
  console.log("All rooms deleted.");
}
forceClean().catch(console.error);
