import { NextRequest, NextResponse } from "next/server";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

// Sample texts for voice preview — first in Hindi (shows multilingual ability)
const SAMPLE_TEXTS: Record<string, string> = {
  hi: "नमस्ते! मेरा नाम आपका AI सहायक है। मैं आपकी कैसे मदद कर सकता हूँ?",
  en: "Hello! I am your AI voice assistant. I can speak fluently in English and Hindi. How can I help you today?",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const voice = searchParams.get("voice") || "anushka";
  const lang = (searchParams.get("lang") || "hi-IN") as string;
  const customText = searchParams.get("text");

  const langKey = lang.startsWith("hi") ? "hi" : "en";
  const text = customText || SAMPLE_TEXTS[langKey];

  // Determine model from voice
  const v3BetaVoices = ["ritu","pooja","simran","kavya","ishita","shreya","priya","shubh","rahul",
    "amit","ratan","rohan","dev","manan","sumit","aditya","kabir","neha","varun","roopa",
    "aayan","ashutosh","advait","amelia","sophia"];
  const model = v3BetaVoices.includes(voice) ? "bulbul:v3-beta" : "bulbul:v2";

  try {
    const res = await fetch(SARVAM_TTS_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: lang,
        speaker: voice,
        model,
        pace: 1.1,
        speech_sample_rate: 22050,
        enable_preprocessing: false,
        output_audio_bitrate: "128k",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Sarvam TTS error:", errText);
      return NextResponse.json({ error: "TTS API error" }, { status: 502 });
    }

    const data = await res.json();
    // Sarvam returns base64 audio
    const audioBase64: string = data.audios?.[0];
    if (!audioBase64) return NextResponse.json({ error: "No audio returned" }, { status: 500 });

    const audioBuffer = Buffer.from(audioBase64, "base64");
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audioBuffer.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
