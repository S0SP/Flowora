import { NextRequest, NextResponse } from "next/server";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";

// Sample texts for voice preview — first in Hindi (shows multilingual ability)
const SAMPLE_TEXTS: Record<string, string> = {
  hi: "नमस्ते! मेरा नाम आपका AI सहायक है। मैं आपकी कैसे मदद कर सकता हूँ?",
  en: "Hello! I am your AI voice assistant. I can speak fluently in English. How can I help you today?",
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured on server" }, { status: 500 });
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text }]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: matchedGeminiVoice
              }
            }
          }
        }
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini TTS error:", errText);
        return NextResponse.json({ error: "Gemini TTS API error" }, { status: 502 });
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.mimeType?.startsWith("audio/"));
      if (!audioPart || !audioPart.inlineData?.data) {
        return NextResponse.json({ error: "No audio returned from Gemini" }, { status: 500 });
      }

      const rawPcm = Buffer.from(audioPart.inlineData.data, "base64");
      const header = getWavHeader(rawPcm.length, 24000, 1, 16);
      const audioBuffer = Buffer.concat([header, rawPcm]);

      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": String(audioBuffer.length),
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err: any) {
      console.error("Error generating Gemini voice sample:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // 2. Otherwise fallback to Sarvam bulbul TTS
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
