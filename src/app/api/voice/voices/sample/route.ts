import { NextRequest, NextResponse } from "next/server";

const SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech";
const GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
const GEMINI_LIVE_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

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

function wavResponseFromPcm(pcmBuffer: Buffer) {
  const header = getWavHeader(pcmBuffer.length, 24000, 1, 16);
  const wavBuffer = Buffer.concat([header, pcmBuffer]);
  return new NextResponse(wavBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wavBuffer.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

async function liveMessageText(data: unknown) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (data instanceof Blob) return data.text();
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer).toString("utf8");
  return String(data);
}

async function generateGeminiLiveSample(apiKey: string, voiceName: string, text: string) {
  return await new Promise<NextResponse>((resolve, reject) => {
    const ws = new WebSocket(`${GEMINI_LIVE_WS_URL}?key=${encodeURIComponent(apiKey)}`);
    const audioChunks: Buffer[] = [];
    let settled = false;
    let sentPrompt = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {}
      fn();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Gemini Live sample timed out")));
    }, 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
            thinkingConfig: {
              thinkingLevel: "minimal",
            },
          },
        },
      }));
    };

    ws.onerror = () => {
      finish(() => reject(new Error("Gemini Live websocket failed")));
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(await liveMessageText(event.data));
        if (message.error) {
          finish(() => reject(new Error(message.error.message || "Gemini Live API error")));
          return;
        }

        if (message.setupComplete && !sentPrompt) {
          sentPrompt = true;
          ws.send(JSON.stringify({
            realtimeInput: {
              text: `Say naturally in a short friendly voice sample, then stop: ${text}`,
            },
          }));
          return;
        }

        const parts = message.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          const audioData = part.inlineData?.data;
          if (audioData) {
            audioChunks.push(Buffer.from(audioData, "base64"));
          }
        }

        if (message.serverContent?.turnComplete) {
          if (audioChunks.length === 0) {
            finish(() => reject(new Error("No audio returned from Gemini Live")));
            return;
          }
          finish(() => resolve(wavResponseFromPcm(Buffer.concat(audioChunks))));
        }
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error("Invalid Gemini Live response")));
      }
    };
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured on server" }, { status: 500 });
    }

    try {
      const payload = {
        model: GEMINI_TTS_MODEL,
        input: text,
        response_format: {
          type: "audio",
          sample_rate: 24000,
        },
        generation_config: {
          speech_config: [
            {
              voice: matchedGeminiVoice,
            },
          ],
        },
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(GEMINI_INTERACTIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Gemini TTS error:", errText);
          if (attempt === 0 && res.status >= 500) continue;
          return NextResponse.json({ error: "Gemini TTS API error" }, { status: 502 });
        }

        const data = await res.json();
        const audio = extractGeminiAudio(data);
        if (audio) {
          return audioResponse(audio.base64, audio.mimeType);
        }

        console.error("Gemini TTS returned no audio:", JSON.stringify(data).slice(0, 1000));
        if (attempt === 0) continue;
      }

      return NextResponse.json({ error: "No audio returned from Gemini" }, { status: 502 });
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
