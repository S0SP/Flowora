import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    const params = new URLSearchParams(text);

    const from = params.get("From") || "unknown";
    const to = params.get("To") || "unknown";
    const callSid = params.get("CallSid") || "unknown";

    console.log(`[Twilio Webhook] Incoming call from ${from} to ${to}, CallSid: ${callSid}`);

    // Extract the phone number from the "From" field, which might be a SIP URI like sip:+1234567890@domain.com
    let callerId = from;
    const sipMatch = from.match(/sip:(.+)@/);
    if (sipMatch && sipMatch[1]) {
      callerId = sipMatch[1];
    } else {
      // Remove any non-alphanumeric characters just in case
      callerId = callerId.replace(/[^a-zA-Z0-9+]/g, "");
    }

    let businessNumber = to;
    const toMatch = to.match(/sip:(.+)@/);
    if (toMatch && toMatch[1]) {
      businessNumber = toMatch[1];
    } else {
      businessNumber = businessNumber.replace(/[^a-zA-Z0-9+]/g, "");
    }

    // Default to a placeholder if the environment variable is missing
    const livekitSipDomain = process.env.LIVEKIT_SIP_DOMAIN || "your-project.sip.livekit.cloud";

    // Generate the TwiML to forward the SIP call to LiveKit
    // Dial the business number so LiveKit recognizes it, and pass callerId so the agent knows who called
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}">
    <Sip>sip:${businessNumber}@${livekitSipDomain}</Sip>
  </Dial>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("[Twilio Webhook] Error processing request:", error);
    // Even on error, return some valid TwiML to hang up gracefully
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject reason="busy" />
</Response>`;
    return new NextResponse(fallbackTwiml, {
      status: 500,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}
