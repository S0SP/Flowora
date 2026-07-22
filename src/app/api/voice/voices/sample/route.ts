import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

export const runtime = "nodejs";

// Sample texts for voice preview — first in Hindi (shows multilingual ability)
const SAMPLE_TEXTS: Record<string, string> = {
  hi: "नमस्ते! मैं आपका AI सहायक हूँ। आपकी कैसे मदद कर सकता हूँ?",
  en: "Hello! I am your AI voice assistant. How can I help you today?",
};

const GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe",
  "Autonoe", "Enceladus", "Iocaste", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib",
  "Rasalghul", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima",
  "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sulafat", "Sadaltager"
];

function getWavHeader(dataLength: number, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
}

function wavResponseFromPcm(pcmBuffer: Buffer, sampleRate = 24000) {
  const header = getWavHeader(pcmBuffer.length, sampleRate, 1, 16);
  const wavBuffer = Buffer.concat([header, pcmBuffer]);
  return new NextResponse(wavBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wavBuffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

async function generateSarvamSample(voice: string, lang: string, text: string) {
  const v3BetaVoices = [
    "ritu", "pooja", "simran", "kavya", "ishita", "shreya", "priya", "shubh", "rahul",
    "amit", "ratan", "rohan", "dev", "manan", "sumit", "aditya", "kabir", "neha", "varun", "roopa",
    "aayan", "ashutosh", "advait", "amelia", "sophia"
  ];
  const validV2Voices = ["anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"];

  const requestedLower = voice.toLowerCase();
  const isV3 = v3BetaVoices.includes(requestedLower);
  const sarvamVoice = isV3 ? requestedLower : (validV2Voices.includes(requestedLower) ? requestedLower : "anushka");
  const model = isV3 ? "bulbul:v3-beta" : "bulbul:v2";

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("Sarvam API key missing");
  }

  const res = await fetch(SARVAM_TTS_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: lang,
      speaker: sarvamVoice,
      model,
      pace: 1.0,
      speech_sample_rate: 22050,
      enable_preprocessing: false,
      output_audio_bitrate: "128k",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sarvam TTS API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const audioBase64: string = data.audios?.[0];
  if (!audioBase64) throw new Error("No audio returned from Sarvam");

  const audioBuffer = Buffer.from(audioBase64, "base64");
  return new NextResponse(audioBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(audioBuffer.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const voice = searchParams.get("voice") || "anushka";
  const lang = (searchParams.get("lang") || "hi-IN") as string;
  const customText = searchParams.get("text");

  const langKey = lang.startsWith("hi") ? "hi" : "en";
  const text = customText || SAMPLE_TEXTS[langKey];

  // 1. Check if the requested voice is a Gemini voice
  const matchedGeminiVoice = GEMINI_VOICES.find(
    (v) => v.toLowerCase() === voice.toLowerCase()
  );

  if (matchedGeminiVoice) {
    const voiceFile = `${matchedGeminiVoice.toLowerCase()}.wav`;
    const staticFilePath = path.join(process.cwd(), "public", "voices", "gemini", voiceFile);

    // Serve pre-generated static preview file if available (0 latency, 0 cost, 0 rate limits)
    if (fs.existsSync(staticFilePath)) {
      const fileBuffer = fs.readFileSync(staticFilePath);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(fileBuffer.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Fallback to Sarvam TTS sample so user ALWAYS gets audio preview if static file is missing
    try {
      return await generateSarvamSample("anushka", lang, text);
    } catch (err: any) {
      console.error("Sarvam fallback error for Gemini voice:", err.message);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // 2. Handle Sarvam voice sample directly
  try {
    return await generateSarvamSample(voice, lang, text);
  } catch (err: any) {
    console.error("Sarvam voice sample error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
