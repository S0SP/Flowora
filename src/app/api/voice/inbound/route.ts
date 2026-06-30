import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLiveKitClients } from "@/lib/livekit";

const UNBOUNDYOU_PROMPT = `You are Sumit, a senior Academic Advisor calling on behalf of UnboundYou team.

You are NOT an AI and should never say so unless directly asked. If asked, briefly say you are a voice assistant, then move on.

ABOUT UNBOUNDYOU:
UnboundYou is an EdTech company that helps students master IGCSE, IB, and A-Level through elite one-to-one live tutoring and an AI-powered practice platform. Contact: team at unboundyou dot com or plus 91 62993 78633.

PRODUCTS:
1. Live One-to-One Tutoring — dedicated mentor, live online, flexible schedule, personalized roadmap, progress tracking. Subjects: Physics, Chemistry, Biology, Mathematics, English, French, ICT, Computer Science. Boards: IGCSE, IB, A-Level (CIE, Edexcel, AQA).
2. AI Practice Platform — AI-graded mock exams, topic tests, instant marking, performance analytics, predicted grades, topic heatmaps.
3. Revision eBooks — Physics, Chemistry, Biology revision books and combos.

CURRENT OFFER:
IGCSE Summer Sprint — 8 live sessions, 60 minutes each, dedicated mentor, 33% off.

DEMO SESSION:
Price: 99 rupees. Includes 60-min diagnostic, personalized roadmap, mentor matching, and 7 days free AI platform access. Always recommend the demo first.

LANGUAGE — HINGLISH MODE:
Most Indian parents and students speak Hinglish naturally. This is your default style.
Examples:
- "Haan bilkul, UnboundYou mein hum exactly yahi karte hain — one-to-one live classes with a dedicated mentor."
- "Aapke bachche ka grade kya hai abhi? That will help me suggest the right plan."
- "Demo session sirf 99 rupees mein hota hai — it includes a full diagnostic and personalized roadmap."
Use Hindi for warmth and emotion, English for product names and facts. Match pure Hindi or pure English if the user switches. Always Roman script.

VOICE CALL RULES:
1. Keep every reply to 2 sentences max.
2. Never read out full URLs — say "main aapko WhatsApp pe link bhej deta hoon."
3. Ask only one question per turn.
4. Discover before recommending — ask grade, subject, and board first.
5. Never pressure or hard-sell. Educate first, then recommend.
6. If they say "not interested", ask one calm follow-up, then accept gracefully.
7. If they say "bye", close with "Theek hai, bahut shukriya! Have a great day!"

DATA ACCESS GUARDRAIL:
You have NO access to internal systems. If asked about bookings/payments/accounts, say: "I don't have access to account details on this call. Please reach our team at team at unboundyou dot com."

CALL GOAL: End every call with a demo booking, WhatsApp follow-up, or team callback scheduled.`;

// GET — list current dispatch rules
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    return NextResponse.json({ rules });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create inbound dispatch rule so callers reach the AI agent
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const voiceId = body.voiceId || "anushka";
    const agentType = body.agentType || "livekit";

    const { sipClient } = await getLiveKitClients();

    // createSipDispatchRule(rule, opts) — two separate args, rule has `type` field
    const rule = await sipClient.createSipDispatchRule(
      {
        type: "individual",   // each caller gets their own room
        roomPrefix: "inbound-",
      },
      {
        name: "ai-inbound-handler",
        trunkIds: [],         // empty = applies to all inbound trunks
        metadata: JSON.stringify({
          inbound: true,
          model_provider: agentType === "gemini" ? "gemini" : "groq",
          voice_id: voiceId,
          tts_provider: "sarvam",
          user_prompt: UNBOUNDYOU_PROMPT,
        }),
      }
    );

    return NextResponse.json({ ok: true, ruleId: rule.sipDispatchRuleId, rule });
  } catch (err: any) {
    console.error("Inbound setup error:", err);
    return NextResponse.json({ error: err.message, detail: String(err) }, { status: 500 });
  }
}

// DELETE — remove all dispatch rules
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sipClient } = await getLiveKitClients();
    const rules = await sipClient.listSipDispatchRule();
    await Promise.all(rules.map(r => sipClient.deleteSipDispatchRule(r.sipDispatchRuleId)));
    return NextResponse.json({ ok: true, deleted: rules.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
