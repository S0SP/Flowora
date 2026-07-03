import os
import certifi

# Fix for SSL Certificate errors - MUST be before other imports
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import json
import re
import time
import math
from dotenv import load_dotenv

from livekit import agents, api
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    sarvam,
    google
)
from livekit.agents import llm
from typing import Optional
import asyncio
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

load_dotenv(".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("outbound-agent")

import config

# ---------------------------------------------------------------------------
# Cost pricing constants (prices in INR, USD-INR rate: 84)
# ---------------------------------------------------------------------------
COST_CALL_PULSE_INR        = 0.50    # ₹0.50 per started minute (pulse billing)
COST_DEEPGRAM_PER_MIN_INR  = 0.3612  # Deepgram Nova-2: $0.0043/min × 84
COST_SARVAM_PER_1K_CHARS_INR = 0.80  # Sarvam bulbul TTS: ~₹0.80/1000 chars
COST_GROQ_8B_INPUT_PER_1K  = 0.0042  # llama-3.1-8b-instant: $0.05/1M × 84
COST_GROQ_8B_OUTPUT_PER_1K = 0.0067  # llama-3.1-8b-instant: $0.08/1M × 84
COST_GROQ_70B_INPUT_PER_1K = 0.0496  # llama-3.3-70b-versatile: $0.59/1M × 84
COST_GROQ_70B_OUTPUT_PER_1K = 0.0664 # llama-3.3-70b-versatile: $0.79/1M × 84
COST_GEMINI_INPUT_PER_1K   = 0.0063  # gemini-2.0-flash: $0.075/1M × 84
COST_GEMINI_OUTPUT_PER_1K  = 0.0252  # gemini-2.0-flash: $0.30/1M × 84

# ---------------------------------------------------------------------------
# Multilingual language detection — all major Indian scripts + romanized
# ---------------------------------------------------------------------------

# Unicode script ranges mapped to Sarvam TTS language codes
_SCRIPT_TO_LANG = [
    (re.compile(r'[ঀ-৿]'), "bn-IN"),  # Bengali
    (re.compile(r'[઀-૿]'), "gu-IN"),  # Gujarati
    (re.compile(r'[਀-੿]'), "pa-IN"),  # Gurmukhi / Punjabi
    (re.compile(r'[଀-୿]'), "or-IN"),  # Odia
    (re.compile(r'[஀-௿]'), "ta-IN"),  # Tamil
    (re.compile(r'[ఀ-౿]'), "te-IN"),  # Telugu
    (re.compile(r'[ಀ-೿]'), "kn-IN"),  # Kannada
    (re.compile(r'[ഀ-ൿ]'), "ml-IN"),  # Malayalam
    (re.compile(r'[ऀ-ॿ]'), "hi-IN"),  # Devanagari (Hindi/Marathi)
]

# Romanized Hindi / Hinglish keyword detector
_HINGLISH_PATTERN = re.compile(
    r'\b(kya|hai|hain|aap|main|mujhe|karo|kar|kyun|kaise|nahi|nahin|'
    r'haan|theek|bahut|accha|school|fees|kab|kitna|bata|batao|'
    r'paisa|rupay|namaste|shukriya|dhanyawad|bilkul|zaroor|'
    r'samajh|samjhe|bol|bolo|kuch|sab|woh|yeh|jo|toh|lekin|'
    r'mera|meri|tera|teri|thik|karo|bhai|didi|acha)\b',
    re.IGNORECASE
)

def _detect_language(text: str) -> str:
    """
    Detect language from transcribed text.
    Returns a Sarvam-compatible BCP-47 language code.
    Priority: Unicode script → romanized Hinglish keywords → English default.
    """
    if not text or not text.strip():
        return "en-IN"
    for pattern, lang_code in _SCRIPT_TO_LANG:
        if pattern.search(text):
            return lang_code
    if _HINGLISH_PATTERN.search(text):
        return "hi-IN"
    return "en-IN"


# ---------------------------------------------------------------------------
# TTS voice catalogue
# ---------------------------------------------------------------------------

SARVAM_V2_VOICES = {"anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"}
SARVAM_V3_VOICES = {
    "ritu", "pooja", "simran", "kavya", "ishita", "shreya", "priya",
    "shubh", "rahul", "amit", "ratan", "rohan", "dev", "manan", "sumit",
    "aditya", "kabir", "neha", "varun", "roopa", "aayan", "ashutosh", "advait",
    "amelia", "sophia",
}
SARVAM_ALL_VOICES = SARVAM_V2_VOICES | SARVAM_V3_VOICES


_MD_STRIP = re.compile(
    r'\*{1,3}([^*]+)\*{1,3}'   # *italic*, **bold**, ***both***
    r'|`[^`]+`'                 # `inline code`
    r'|#{1,6}\s+'               # ## heading prefix
    r'|^[-*+]\s+'               # - bullet / * bullet
    r'|\[([^\]]+)\]\([^)]+\)',  # [link text](url)
    re.MULTILINE,
)

def _strip_markdown(text: str) -> str:
    """Remove markdown formatting so Sarvam TTS only receives plain text."""
    cleaned = _MD_STRIP.sub(lambda m: m.group(1) or m.group(2) or "", text)
    return cleaned.strip()


def _build_tts(config_provider: str = None, config_voice: str = None):
    """Configure Text-to-Speech provider from env vars or dynamic config."""
    provider = (config_provider or os.getenv("TTS_PROVIDER", config.DEFAULT_TTS_PROVIDER)).lower()

    if config_voice and config_voice.lower() in SARVAM_ALL_VOICES:
        provider = "sarvam"

    if provider == "cartesia":
        logger.info("Using Cartesia TTS")
        return cartesia.TTS(
            model=os.getenv("CARTESIA_TTS_MODEL", config.CARTESIA_MODEL),
            voice=os.getenv("CARTESIA_TTS_VOICE", config.CARTESIA_VOICE),
        )

    if provider == "sarvam":
        voice = (config_voice or os.getenv("SARVAM_VOICE", "anushka")).lower()
        if voice not in SARVAM_ALL_VOICES:
            logger.warning(f"Unknown Sarvam voice '{voice}', falling back to anushka.")
            voice = "anushka"
        model = "bulbul:v3-beta" if voice in SARVAM_V3_VOICES else os.getenv("SARVAM_TTS_MODEL", config.SARVAM_MODEL)
        language = os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)
        logger.info(f"Using Sarvam TTS — voice={voice}, model={model}, lang={language}")
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language)

    logger.info(f"Using OpenAI TTS")
    return openai.TTS(
        model=os.getenv("OPENAI_TTS_MODEL", "tts-1"),
        voice=config_voice or os.getenv("OPENAI_TTS_VOICE", config.DEFAULT_TTS_VOICE),
    )


# ---------------------------------------------------------------------------
# Groq → Gemini fallback LLM
# ---------------------------------------------------------------------------

def _is_rate_limit(exc: BaseException) -> bool:
    seen: set = set()
    e: BaseException | None = exc
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        msg = str(e)
        if "429" in msg or "rate_limit" in msg.lower() or "rate limit" in msg.lower():
            return True
        e = getattr(e, "__cause__", None) or getattr(e, "__context__", None)
    return False


class _FallbackStream(llm.LLMStream):
    def __init__(self, llm_instance, *, primary, fallback, chat_ctx, tools, conn_options=None):
        super().__init__(llm_instance, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)
        self._primary = primary
        self._fallback = fallback

    async def _run(self):
        candidates = [(self._primary, "Groq"), (self._fallback, "Gemini")]
        for i, (candidate_llm, name) in enumerate(candidates):
            is_last = i == len(candidates) - 1
            try:
                inner = candidate_llm.chat(chat_ctx=self._chat_ctx, tools=self._tools)
                async for chunk in inner:
                    self._event_ch.send_nowait(chunk)
                return
            except Exception as e:
                if not is_last and _is_rate_limit(e):
                    logger.warning(f"⚡ {name} rate-limited — switching to Gemini fallback")
                    continue
                raise


class FallbackLLM(llm.LLM):
    def __init__(self, primary: llm.LLM, fallback: llm.LLM):
        super().__init__()
        self._primary = primary
        self._fallback = fallback

    def chat(self, *, chat_ctx, tools=None, conn_options=None, **kwargs):
        return _FallbackStream(
            self,
            primary=self._primary,
            fallback=self._fallback,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )


def _build_llm(config_provider: str = None):
    """Configure LLM. Groq gets automatic Gemini fallback on 429."""
    provider = (config_provider or os.getenv("LLM_PROVIDER", config.DEFAULT_LLM_PROVIDER)).lower()

    if provider == "groq":
        logger.info("Using Groq LLM")
        primary = openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", config.GROQ_MODEL),
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(config.GROQ_TEMPERATURE))),
        )
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if gemini_key:
            try:
                fallback = google.LLM(api_key=gemini_key, model="gemini-2.0-flash")
                logger.info("🔄 Gemini Flash configured as Groq fallback")
                return FallbackLLM(primary=primary, fallback=fallback)
            except Exception as e:
                logger.warning(f"Could not build Gemini fallback: {e}")
        return primary

    if provider == "gemini":
        logger.info("Using Gemini LLM")
        return google.LLM(
            api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            model=os.getenv("GEMINI_LLM_MODEL", "gemini-2.0-flash"),
        )

    logger.info("Using OpenAI LLM")
    return openai.LLM(model=config.DEFAULT_LLM_MODEL)


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

class TransferFunctions(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, phone_number: str = None):
        super().__init__(tools=[])
        self.ctx = ctx
        self.phone_number = phone_number

    @llm.function_tool(description="Look up user details by phone number.")
    async def lookup_user(self, phone: str):
        logger.info(f"Looking up user: {phone}")
        return f"User found: Active customer. Welcome back."

    @llm.function_tool(description="Transfer the call to a human support agent.")
    async def transfer_call(self, destination: Optional[str] = None):
        if destination is None:
            destination = config.DEFAULT_TRANSFER_NUMBER
            if not destination:
                return "Error: No default transfer number configured."
        if "@" not in destination:
            if config.SIP_DOMAIN:
                clean_dest = destination.replace("tel:", "").replace("sip:", "")
                destination = f"sip:{clean_dest}@{config.SIP_DOMAIN}"
            elif not destination.startswith("tel:") and not destination.startswith("sip:"):
                destination = f"tel:{destination}"
        elif not destination.startswith("sip:"):
            destination = f"sip:{destination}"

        participant_identity = None
        if self.phone_number:
            participant_identity = f"sip_{self.phone_number}"
        else:
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break

        if not participant_identity:
            return "Failed to transfer: could not identify the caller."

        try:
            await self.ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self.ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=destination,
                    play_dialtone=False,
                )
            )
            return "Transfer initiated successfully."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return f"Error executing transfer: {e}"


class OutboundAssistant(Agent):
    def __init__(self, tools: list, system_prompt: str = None) -> None:
        super().__init__(
            instructions=system_prompt or config.SYSTEM_PROMPT,
            tools=tools,
        )


# ---------------------------------------------------------------------------
# SIP number formatting
# ---------------------------------------------------------------------------

def format_voicelink_sip_number(to_number: str) -> str:
    digits = ''.join(c for c in to_number if c.isdigit())
    if len(digits) == 10:
        formatted = "91" + digits
    elif len(digits) == 12 and digits.startswith("91"):
        formatted = digits
    elif len(digits) == 11 and digits.startswith("0"):
        formatted = "91" + digits[1:]
    else:
        formatted = digits
    tech_prefix = os.getenv("VOICELINK_SIP_TECH_PREFIX", "45454")
    return f"{tech_prefix}{formatted}"


# ---------------------------------------------------------------------------
# Multilingual auto-switch for TTS
# ---------------------------------------------------------------------------

def _setup_language_auto_switch(session: AgentSession, tts_instance) -> None:
    """
    Listens to every user utterance and updates Sarvam TTS language in real-time
    when the user switches between any supported Indian language or English.
    """
    current_language = {"code": os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)}

    def on_user_speech_committed(ev):
        transcript = getattr(ev, "transcript", "") or getattr(ev, "text", "") or ""
        if not transcript:
            return

        # Only switch TTS language when the user is actually writing in a non-Latin Indian
        # script (Devanagari, Tamil, Telugu, etc.).  Hinglish in Roman letters is detected
        # as "hi-IN" by keyword matching, but the LLM is instructed to reply in Roman script,
        # and bulbul:v3-beta rejects plain ASCII text when target_language_code is "hi-IN".
        # Keep the TTS language at "en-IN" for all Roman-script input.
        detected_script_lang = None
        for pattern, lang_code in _SCRIPT_TO_LANG:
            if pattern.search(transcript):
                detected_script_lang = lang_code
                break

        detected = detected_script_lang or "en-IN"

        if detected == current_language["code"]:
            return

        current_language["code"] = detected
        lang_name = config.LANGUAGE_NAMES.get(detected, detected)
        logger.info(f"🌐 Language switch → {detected} ({lang_name}) | transcript: '{transcript[:60]}'")

        if isinstance(tts_instance, sarvam.TTS):
            try:
                tts_instance.update_options(target_language_code=detected)
                logger.info(f"✅ Sarvam TTS language updated to: {detected} ({lang_name})")
            except Exception as e:
                logger.error(f"Failed to update Sarvam TTS language: {e}")
        else:
            logger.info(f"TTS provider does not support dynamic language switching. User lang: {detected}")

    session.on("user_speech_committed", on_user_speech_committed)

    # Strip markdown formatting from every agent reply before Sarvam synthesises
    # it.  Sarvam bulbul rejects text containing only punctuation/symbols (e.g.
    # "**Hi**") with a 422 "no valid language characters" error.
    if isinstance(tts_instance, sarvam.TTS):
        def on_before_tts(ev):
            raw = getattr(ev, "text", "") or ""
            clean = _strip_markdown(raw)
            if clean != raw:
                logger.info(f"🧹 Stripped markdown before TTS: {raw!r} → {clean!r}")
            logger.info(f"🔊 TTS input ({len(clean)} chars): {clean[:120]!r}")
            if hasattr(ev, "text"):
                try:
                    ev.text = clean or "."   # Sarvam needs at least one character
                except AttributeError:
                    pass  # read-only event — nothing we can do

        try:
            session.on("before_tts_synthesize", on_before_tts)
        except Exception:
            pass  # older SDK versions may not have this event

    logger.info("🌐 Multilingual auto-switch enabled (10 Indian languages + English)")


# ---------------------------------------------------------------------------
# Cost calculation
# ---------------------------------------------------------------------------

def _get_message_text(m) -> str:
    """Extract plain text from a chat message, regardless of content structure."""
    try:
        content = m.content
        if callable(content):
            content = content()
        if isinstance(content, list) and content:
            return getattr(content[0], "text", None) or str(content[0])
        if isinstance(content, str):
            return content
    except Exception:
        pass
    return ""


def _calculate_costs(messages: list, call_duration_secs: int, llm_provider: str, llm_model: str) -> dict:
    """
    Estimate per-call API costs in INR from transcript and call duration.
    Uses rough token estimation (1 token ≈ 3.5 chars for mixed Hindi/English).
    """
    CHARS_PER_TOKEN = 3.5

    assistant_text = ""
    full_context = config.SYSTEM_PROMPT
    for m in messages:
        text = _get_message_text(m)
        if not text:
            continue
        full_context += " " + text
        if getattr(m, "role", "") == "assistant":
            assistant_text += text + " "

    input_tokens  = max(1, int(len(full_context) / CHARS_PER_TOKEN))
    output_tokens = max(1, int(len(assistant_text) / CHARS_PER_TOKEN))
    tts_chars     = len(assistant_text.strip())
    duration_mins = call_duration_secs / 60.0

    # Pulse billing: ceiling per started minute
    pulses = max(1, math.ceil(duration_mins))

    # LLM pricing tier
    model_lower = llm_model.lower()
    if "gemini" in llm_provider.lower():
        in_rate, out_rate = COST_GEMINI_INPUT_PER_1K, COST_GEMINI_OUTPUT_PER_1K
        llm_label = "Gemini 2.0 Flash"
    elif "70b" in model_lower or "versatile" in model_lower:
        in_rate, out_rate = COST_GROQ_70B_INPUT_PER_1K, COST_GROQ_70B_OUTPUT_PER_1K
        llm_label = "Groq llama-3.3-70b"
    else:
        in_rate, out_rate = COST_GROQ_8B_INPUT_PER_1K, COST_GROQ_8B_OUTPUT_PER_1K
        llm_label = "Groq llama-3.1-8b"

    call_cost = pulses * COST_CALL_PULSE_INR
    stt_cost  = duration_mins * COST_DEEPGRAM_PER_MIN_INR
    tts_cost  = (tts_chars / 1000.0) * COST_SARVAM_PER_1K_CHARS_INR
    llm_cost  = (input_tokens / 1000.0) * in_rate + (output_tokens / 1000.0) * out_rate
    total     = call_cost + stt_cost + tts_cost + llm_cost

    logger.info(
        f"💰 COST BREAKDOWN | total=₹{total:.4f} | "
        f"pulse=₹{call_cost:.4f} ({pulses} min) | "
        f"STT=₹{stt_cost:.4f} | TTS=₹{tts_cost:.4f} | LLM=₹{llm_cost:.4f}"
    )

    return {
        "total_inr": round(total, 4),
        "breakdown": {
            "call_pulse": {
                "pulses": pulses,
                "rate_per_pulse_inr": COST_CALL_PULSE_INR,
                "cost_inr": round(call_cost, 4),
                "note": f"{pulses} pulse(s) × ₹{COST_CALL_PULSE_INR} (ceil-minute billing)",
            },
            "stt_deepgram": {
                "provider": "Deepgram Nova-2",
                "duration_seconds": call_duration_secs,
                "duration_mins": round(duration_mins, 2),
                "rate_per_min_inr": COST_DEEPGRAM_PER_MIN_INR,
                "cost_inr": round(stt_cost, 4),
            },
            "tts_sarvam": {
                "provider": "Sarvam Bulbul",
                "characters": tts_chars,
                "rate_per_1k_chars_inr": COST_SARVAM_PER_1K_CHARS_INR,
                "cost_inr": round(tts_cost, 4),
            },
            "llm": {
                "provider": llm_label,
                "model": llm_model,
                "estimated_input_tokens": input_tokens,
                "estimated_output_tokens": output_tokens,
                "rate_input_per_1k_inr": in_rate,
                "rate_output_per_1k_inr": out_rate,
                "cost_inr": round(llm_cost, 4),
                "note": "Token counts are estimates (~3.5 chars/token for mixed Hindi-English)",
            },
        },
    }


# ---------------------------------------------------------------------------
# Main agent entrypoint
# ---------------------------------------------------------------------------

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    logger.info(f"Connecting to room: {ctx.room.name}")

    phone_number = None
    config_dict  = {}
    call_start   = time.time()

    # Parse job metadata (legacy / dispatch)
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
            config_dict  = data
    except Exception:
        pass

    # Parse room metadata — overrides job metadata
    try:
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            if data.get("phone_number"):
                phone_number = data["phone_number"]
            config_dict.update(data)
    except Exception:
        logger.warning("No valid JSON metadata in room.")

    fnc_ctx = TransferFunctions(ctx, phone_number)

    # Resolved config for this call
    resolved_prompt   = config_dict.get("user_prompt") or config.SYSTEM_PROMPT
    resolved_voice    = config_dict.get("voice_id") or config.DEFAULT_TTS_VOICE
    resolved_provider = config_dict.get("model_provider", os.getenv("LLM_PROVIDER", config.DEFAULT_LLM_PROVIDER)).lower()
    resolved_model    = os.getenv("GROQ_MODEL", config.GROQ_MODEL) if resolved_provider == "groq" else os.getenv("GEMINI_LLM_MODEL", "gemini-2.0-flash")
    call_id           = config_dict.get("call_id")

    logger.info(f"=== CALL CONFIG === room={ctx.room.name} | call_id={call_id}")
    logger.info(f"=== CALL CONFIG === voice={resolved_voice!r} | provider={resolved_provider} | model={resolved_model}")
    logger.info(f"=== CALL CONFIG === prompt_src={'metadata' if config_dict.get('user_prompt') else 'config.py'}")

    if resolved_provider == "gemini":
        # ---- Gemini Multimodal Live API path ----
        logger.info("Using Native Gemini Multimodal Live API")

        voice_id = config_dict.get("voice_id", "Aoede")
        valid_gemini_voices = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Puma"]
        voice_id = voice_id.capitalize() if voice_id.capitalize() in valid_gemini_voices else "Aoede"

        model = google.beta.realtime.RealtimeModel(
            model=os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash-exp"),
            api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            instructions=resolved_prompt,
            voice=voice_id,
            temperature=0.8,
        )

        session = AgentSession(llm=model)

        use_nc = os.getenv("ENABLE_NOISE_CANCELLATION", "false").lower() == "true"
        nc_plugin = None
        if use_nc:
            from livekit.plugins import noise_cancellation as _nc
            nc_plugin = _nc.BVCTelephony()

        await session.start(
            room=ctx.room,
            agent=OutboundAssistant(tools=list(fnc_ctx.function_tools.values()), system_prompt=resolved_prompt),
            room_input_options=RoomInputOptions(noise_cancellation=nc_plugin, close_on_disconnect=True),
        )
        logger.info("Gemini Multimodal Agent started")

        if phone_number:
            sip_joined = False
            for _ in range(30):
                for p in ctx.room.remote_participants.values():
                    if "sip_" in p.identity:
                        sip_joined = True
                        break
                if sip_joined:
                    break
                await asyncio.sleep(1)
            if sip_joined:
                try:
                    await session.generate_reply(instructions="The user just joined. Please greet them warmly.")
                except Exception as e:
                    logger.warning(f"Gemini greeting failed: {e}")
            else:
                logger.warning("SIP participant never joined within 30s.")
        else:
            await asyncio.sleep(1)
            try:
                await session.generate_reply(instructions="The user just opened the web app. Please greet them warmly.")
            except Exception:
                pass

    else:
        # ---- Groq/OpenAI + Sarvam/Deepgram path (standard pipeline) ----

        # Detect inbound SIP calls by room name even when dispatch-rule metadata is stale.
        is_inbound = config_dict.get("inbound", False) or ctx.room.name.startswith("inbound-")

        # Wait for the SIP participant BEFORE building the AgentSession / opening the
        # Deepgram WebSocket.  Deepgram closes the connection with code 1011 if it does
        # not receive audio data within its idle-timeout window (~10 s), which happens
        # when the session starts before the caller has joined the room.
        sip_joined = False
        if phone_number or is_inbound:
            mode = "Outbound" if phone_number else "Inbound"
            logger.info(f"{mode} call mode — waiting for SIP participant...")

            for _ in range(60):          # wait up to 60 s (SIP setup can be slow)
                for p in ctx.room.remote_participants.values():
                    if "sip_" in p.identity:
                        sip_joined = True
                        break
                if sip_joined:
                    break
                await asyncio.sleep(1)

            if not sip_joined:
                logger.warning("SIP participant never joined within 60 s — aborting session.")
                return                   # nothing to do; avoid opening idle STT connections

        tts_instance = _build_tts(config_dict.get("tts_provider"), resolved_voice)

        stt_instance = deepgram.STT(
            model=os.getenv("STT_MODEL", config.STT_MODEL),
            language="multi",   # Auto-detect any language — Nova-2 supports 30+ languages
        )

        # Use TurnHandlingOptions (livekit-agents ≥ 2.0); fall back to the deprecated
        # keyword arguments for older installs that do not have that class yet.
        try:
            from livekit.agents import TurnHandlingOptions
            session = AgentSession(
                stt=stt_instance,
                llm=_build_llm(config_dict.get("model_provider")),
                tts=tts_instance,
                turn_handling=TurnHandlingOptions(
                    min_endpointing_delay=0.4,   # respond 400 ms after speech ends
                    allow_interruptions=True,    # user can interrupt mid-response
                ),
            )
        except (ImportError, TypeError):
            session = AgentSession(
                stt=stt_instance,
                llm=_build_llm(config_dict.get("model_provider")),
                tts=tts_instance,
                min_endpointing_delay=0.4,
                allow_interruptions=True,
            )

        _setup_language_auto_switch(session, tts_instance)

        use_nc = os.getenv("ENABLE_NOISE_CANCELLATION", "false").lower() == "true"
        nc_plugin = None
        if use_nc:
            from livekit.plugins import noise_cancellation as _nc
            nc_plugin = _nc.BVCTelephony()

        # Use RoomOptions (livekit-agents ≥ 2.0); fall back to RoomInputOptions for
        # older installs.
        try:
            from livekit.agents import RoomOptions
            await session.start(
                room=ctx.room,
                agent=OutboundAssistant(tools=list(fnc_ctx.function_tools.values()), system_prompt=resolved_prompt),
                room_options=RoomOptions(noise_cancellation=nc_plugin, close_on_disconnect=True),
            )
        except (ImportError, TypeError):
            await session.start(
                room=ctx.room,
                agent=OutboundAssistant(tools=list(fnc_ctx.function_tools.values()), system_prompt=resolved_prompt),
                room_input_options=RoomInputOptions(noise_cancellation=nc_plugin, close_on_disconnect=True),
            )

        # Hard-coded plain-text greeting spoken directly via TTS, bypassing the LLM.
        # generate_reply(instructions=...) routes through the LLM which can produce
        # markdown (**bold**) or guess the wrong language — both cause Sarvam 422.
        # session.say() sends the exact string to TTS with zero LLM involvement.
        GREETING_TEXT = "Hi, this is Aria from UnboundYou! How can I help you today?"

        if phone_number or is_inbound:
            # SIP participant already confirmed present — greet immediately
            logger.info("SIP participant joined — speaking greeting directly via TTS")
            try:
                await session.say(GREETING_TEXT, allow_interruptions=True)
            except Exception as e:
                logger.error(f"Greeting failed: {e}")
        else:
            logger.info("Web/dashboard session. Greeting immediately...")
            await asyncio.sleep(1)
            try:
                await session.say(config.WEB_GREETING, allow_interruptions=True)
            except Exception as e:
                logger.error(f"Web greeting failed: {e}")

    # ---- On disconnect: build transcript, calculate costs, send webhook ----

    @ctx.room.on("disconnected")
    def on_disconnect(reason):
        logger.info(f"Room disconnected: {reason}")

        call_duration_secs = int(time.time() - call_start)
        logger.info(f"📞 Call duration: {call_duration_secs}s")

        # Extract transcript from session history
        messages = []
        transcript_text = ""
        try:
            history = session.history
            if callable(history):
                history = history()
            raw = getattr(history, "messages", None)
            if callable(raw):
                raw = raw()
            messages = list(raw) if raw else []
            parts = []
            for m in messages:
                text = _get_message_text(m)
                if text:
                    parts.append(f"{m.role}: {text}")
            transcript_text = "\n".join(parts)
        except Exception as e:
            logger.warning(f"Could not extract transcript: {e}")

        # Calculate API costs
        try:
            cost_data = _calculate_costs(messages, call_duration_secs, resolved_provider, resolved_model)
        except Exception as e:
            logger.warning(f"Cost calculation failed: {e}")
            cost_data = {"total_inr": 0, "breakdown": {}}

        async def send_webhook():
            try:
                import aiohttp
                webhook_url = os.getenv("WEBHOOK_URL", "http://localhost:3000/api/voice/transcript")

                payload = {
                    "call_id":           call_id,
                    "phone":             phone_number,
                    "transcript":        transcript_text,
                    "status":            "COMPLETED",
                    "duration_seconds":  call_duration_secs,
                    "cost_breakdown":    cost_data,
                }

                logger.info(f"📤 Sending webhook to {webhook_url} | call_id={call_id}")
                async with aiohttp.ClientSession() as http_session:
                    async with http_session.post(webhook_url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        logger.info(f"Webhook response: {resp.status}")
            except Exception as e:
                logger.error(f"Failed to send webhook: {e}")

        asyncio.create_task(send_webhook())


# ---------------------------------------------------------------------------
# Health check HTTP server
# ---------------------------------------------------------------------------

class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass


def _start_health_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), _HealthHandler)
    logger.info(f"Healthcheck server on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    threading.Thread(target=_start_health_server, daemon=True).start()

    logger.info(f"=== AGENT BOOT === prompt_start: {config.SYSTEM_PROMPT[:60].strip()!r}")
    logger.info(f"=== AGENT BOOT === default_voice={config.DEFAULT_TTS_VOICE} | llm={config.DEFAULT_LLM_PROVIDER}")

    try:
        config.load_dynamic_config()
    except Exception as e:
        logger.warning(f"Failed to load dynamic config: {e}")

    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="outbound-caller",
            # Do not pre-spawn idle worker processes.  Each process loads models and
            # opens connections, which wastes memory in containers and pushes the
            # worker over its memory limit when two concurrent calls arrive (causing
            # the SIGKILL / exit code -9 seen in the logs).
            num_idle_processes=0,
        )
    )
