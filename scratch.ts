import { getLiveKitClients } from "./src/lib/livekit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function check() {
  const { sipClient, roomService } = await getLiveKitClients();
  
  console.log("Fetching LiveKit rooms...");
  const rooms = await roomService.listRooms();
  console.log("Active Rooms:", rooms.map(r => r.name));
  
  for (const r of rooms) {
    if (r.name.startsWith("call-") || r.name.startsWith("inbound-")) {
      console.log(`Killing room: ${r.name}`);
      await roomService.deleteRoom(r.name);
    }
  }

  console.log("Fetching SIP Participants...");
  try {
    const participants = await sipClient.listSipParticipant();
    console.log("SIP Participants:", participants);
    
    // Attempt to terminate them directly
    for (const p of participants) {
      console.log(`Terminating SIP Participant ${p.sipCallId}...`);
      // In LiveKit, deleting a participant from a room removes them,
      // but there's also an API on sipClient to terminate.
      // Let's see if deleteSipParticipant exists, or if we can just use deleteParticipant on the room
    }
  } catch(e) {
    console.error("Error fetching SIP participants:", e);
  }
}

check().catch(console.error);
