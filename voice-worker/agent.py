import os
import certifi

# Fix for SSL Certificate errors - MUST be before other imports
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import json
import re
from dotenv import load_dotenv

from livekit import agents, api
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import (
    openai,
    cartesia,
    deepgram,
    noise_cancellation,
    sarvam,
    google
)
from livekit.agents import llm, stt as stt_module
from typing import Annotated, Optional
import asyncio
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# Load environment variables
load_dotenv(".env")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("outbound-agent")

import config

# ---------------------------------------------------------------------------
# Language detection helpers
# ---------------------------------------------------------------------------

# Common Hindi words / Devanagari script detector
_HINDI_PATTERN = re.compile(
    r'[\u0900-\u097F]|'                            # Devanagari script
    r'\b(kya|hai|hain|aap|main|mujhe|karo|kar|'
    r'kyun|kaise|nahi|haan|theek|bahut|accha|'
    r'school|admission|fees|kab|kitna|bata|batao|'
    r'paisa|rupay|namaste|shukriya|dhanyawad)\b',
    re.IGNORECASE
)

def _detect_language(text: str) -> str:
    """Return 'hi-IN' if Hindi is detected in the text, else 'en-IN'."""
    if _HINDI_PATTERN.search(text):
        return "hi-IN"
    return "en-IN"


def _build_tts(config_provider: str = None, config_voice: str = None):
    """Configure the Text-to-Speech provider based on env vars or dynamic config."""
    # Priority: Config > Env Var > Default
    provider = (config_provider or os.getenv("TTS_PROVIDER", config.DEFAULT_TTS_PROVIDER)).lower()
    
    # If using Sarvam Voice names (Anushka/Aravind), force Sarvam provider
    if config_voice in ["anushka", "aravind", "amartya", "dhruv"]:
        provider = "sarvam"

    if provider == "cartesia":
        logger.info("Using Cartesia TTS")
        model = os.getenv("CARTESIA_TTS_MODEL", config.CARTESIA_MODEL)
        voice = os.getenv("CARTESIA_TTS_VOICE", config.CARTESIA_VOICE)
        return cartesia.TTS(model=model, voice=voice)
    
    if provider == "sarvam":
        logger.info(f"Using Sarvam TTS (Voice: {config_voice})")
        model = os.getenv("SARVAM_TTS_MODEL", config.SARVAM_MODEL)
        voice = config_voice or os.getenv("SARVAM_VOICE", "anushka")
        
        # Sarvam strict voice check
        valid_sarvam_voices = ["anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"]
        if voice.lower() not in valid_sarvam_voices:
            logger.warning(f"Voice {voice} is not valid for Sarvam. Falling back to anushka.")
            voice = "anushka"
            
        language = os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language)

    # Default to OpenAI
    logger.info(f"Using OpenAI TTS (Voice: {config_voice})")
    model = os.getenv("OPENAI_TTS_MODEL", "tts-1")
    voice = config_voice or os.getenv("OPENAI_TTS_VOICE", config.DEFAULT_TTS_VOICE)
    return openai.TTS(model=model, voice=voice)


def _build_llm(config_provider: str = None):
    """Configure the LLM provider based on config or env vars."""
    provider = (config_provider or os.getenv("LLM_PROVIDER", config.DEFAULT_LLM_PROVIDER)).lower()

    if provider == "groq":
        logger.info("Using Groq LLM")
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=os.getenv("GROQ_MODEL", config.GROQ_MODEL),
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(config.GROQ_TEMPERATURE))),
        )
    if provider == "gemini":
        logger.info("Using Gemini LLM")
        from livekit.plugins import google
        # Requires GOOGLE_API_KEY env var
        return google.LLM(
            api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            model=os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash")
        )
        
    # Default to OpenAI
    logger.info("Using OpenAI LLM")
    return openai.LLM(model=config.DEFAULT_LLM_MODEL)


class TransferFunctions(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, phone_number: str = None):
        super().__init__(tools=[])
        self.ctx = ctx
        self.phone_number = phone_number

    @llm.function_tool(description="Look up user details by phone number.")
    def lookup_user(self, phone: str):
        """
        Mock function to look up user details.

        Args:
            phone: The phone number to look up
        """
        logger.info(f"Looking up user: {phone}")
        return f"User found: Sumit Chourasia. Status: Active. Welcome back."

    @llm.function_tool(description="Transfer the call to a human support agent or another phone number.")
    async def transfer_call(self, destination: Optional[str] = None):
        """
        Transfer the call.
        """
        if destination is None:
            destination = config.DEFAULT_TRANSFER_NUMBER
            if not destination:
                 return "Error: No default transfer number configured."
        if "@" not in destination:
            # If no domain is provided, append the SIP domain
            if config.SIP_DOMAIN:
                # Ensure clean number (strip tel: or sip: prefix if present but no domain)
                clean_dest = destination.replace("tel:", "").replace("sip:", "")
                destination = f"sip:{clean_dest}@{config.SIP_DOMAIN}"
            else:
                # Fallback to tel URI if no domain configured
                if not destination.startswith("tel:") and not destination.startswith("sip:"):
                     destination = f"tel:{destination}"
        elif not destination.startswith("sip:"):
             destination = f"sip:{destination}"
        
        logger.info(f"Transferring call to {destination}")
        
        participant_identity = None
        
        # If we stored the phone number from metadata, we can construct the identity
        if self.phone_number:
            participant_identity = f"sip_{self.phone_number}"
        else:
            # Try to find a participant that is NOT the agent
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break
        
        if not participant_identity:
            logger.error("Could not determine participant identity for transfer")
            return "Failed to transfer: could not identify the caller."

        try:
            logger.info(f"Transferring participant {participant_identity} to {destination}")
            await self.ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self.ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=destination,
                    play_dialtone=False
                )
            )
            return "Transfer initiated successfully."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return f"Error executing transfer: {e}"


class OutboundAssistant(Agent):
    """
    An AI agent tailored for outbound calls.
    Attempts to be helpful and concise.
    """
    def __init__(self, tools: list, system_prompt: str = None) -> None:
        super().__init__(
            instructions=system_prompt or config.SYSTEM_PROMPT,
            tools=tools,
        )


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


def _setup_language_auto_switch(session: AgentSession, tts_instance) -> None:
    """
    Subscribe to STT events and auto-switch TTS language when user
    switches between Hindi and English.
    
    Works for both Sarvam TTS (supports update_options) and falls back
    gracefully for other TTS providers.
    """
    current_language = {"code": os.getenv("SARVAM_LANGUAGE", config.SARVAM_LANGUAGE)}

    def on_user_speech_committed(ev):
        """Called when the user finishes speaking and transcript is committed."""
        # ev.transcript contains the recognized text
        transcript = ""
        if hasattr(ev, "transcript"):
            transcript = ev.transcript
        elif hasattr(ev, "text"):
            transcript = ev.text
        
        if not transcript:
            return

        detected = _detect_language(transcript)

        if detected != current_language["code"]:
            current_language["code"] = detected
            logger.info(f"🌐 Language switch detected → {detected} (transcript: '{transcript[:60]}')")

            # Only Sarvam TTS supports real-time language switching
            if isinstance(tts_instance, sarvam.TTS):
                try:
                    tts_instance.update_options(target_language_code=detected)
                    logger.info(f"✅ Sarvam TTS language updated to: {detected}")
                except Exception as e:
                    logger.error(f"Failed to update Sarvam TTS language: {e}")
            else:
                # For other providers, just log (they don't support dynamic language switching)
                logger.info(f"TTS provider does not support dynamic language switch. Current lang: {detected}")

    # Register the event handler on the session
    session.on("user_speech_committed", on_user_speech_committed)
    logger.info("🌐 Multilingual auto-switch enabled (Hindi ↔ English)")


async def entrypoint(ctx: agents.JobContext):
    """
    Main entrypoint for the agent.
    """
    logger.info(f"Connecting to room: {ctx.room.name}")
    
    phone_number = None
    config_dict = {}
    
    # Check Job Metadata (Legacy/Dispatch)
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
            config_dict = data
    except Exception:
        pass
        
    # Check Room Metadata (Dashboard/Route.ts) - Overrides Job Metadata if present
    try:
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            if data.get("phone_number"):
                phone_number = data.get("phone_number")
            config_dict.update(data) # Merge configs
    except Exception:
        logger.warning("No valid JSON metadata found in Room.")

    # Initialize function context
    fnc_ctx = TransferFunctions(ctx, phone_number)
    
    model_provider = config_dict.get("model_provider", "groq").lower()
    
    if model_provider == "gemini":
        logger.info("Using Native Gemini Multimodal Live API")
        
        voice_id = config_dict.get("voice_id", "Aoede")
        valid_gemini_voices = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Puma"]
        
        if voice_id.capitalize() not in valid_gemini_voices:
            voice_id = "Aoede"
        else:
            voice_id = voice_id.capitalize()

        model = google.beta.realtime.RealtimeModel(
            model=os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash-exp"),
            api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"),
            instructions=config_dict.get("user_prompt") or config.SYSTEM_PROMPT,
            voice=voice_id,
            temperature=0.8,
        )

        session = AgentSession(
            llm=model,
        )
        
        await session.start(
            room=ctx.room,
            agent=OutboundAssistant(
                tools=list(fnc_ctx.function_tools.values()),
                system_prompt=config_dict.get("user_prompt")
            ),
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
                close_on_disconnect=True,
            ),
        )
        logger.info("Gemini Multimodal Agent started in room")
        
        if phone_number:
            logger.info("Outbound call mode — waiting for SIP participant to join room...")
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
                logger.info("SIP participant joined. Prompting Gemini to greet...")
                try:
                    await session.generate_reply(instructions="The user just joined the call. Please greet them warmly.")
                except Exception as e:
                    logger.warning(f"Could not nudge Gemini: {e}")
            else:
                logger.warning("SIP participant never joined within 30s. Room will close.")
        else:
            logger.info("Web/dashboard session. Prompting Gemini to greet...")
            await asyncio.sleep(1)
            try:
                await session.generate_reply(instructions="The user just opened the web app. Please greet them warmly.")
            except Exception as e:
                pass

    else:
        # Build TTS instance (kept as a reference so we can update language later)
        tts_instance = _build_tts(config_dict.get("tts_provider"), config_dict.get("voice_id"))

        # Build STT with multilingual support
        stt_language = os.getenv("STT_LANGUAGE", config.STT_LANGUAGE)
        stt_model = os.getenv("STT_MODEL", config.STT_MODEL)
        
        stt_instance = deepgram.STT(
            model=stt_model,
            language=stt_language,
        )

        # Initialize the Agent Session with plugins
        session = AgentSession(
            stt=stt_instance,
            llm=_build_llm(config_dict.get("model_provider")),
            tts=tts_instance,
        )

        # Setup multilingual auto-switching BEFORE starting the session
        _setup_language_auto_switch(session, tts_instance)

        # Start the session
        await session.start(
            room=ctx.room,
            agent=OutboundAssistant(
                tools=list(fnc_ctx.function_tools.values()),
                system_prompt=config_dict.get("user_prompt")
            ),
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
                close_on_disconnect=True,
            ),
        )

        if phone_number:
            logger.info(f"Outbound call mode — waiting for SIP participant to join room...")
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
                logger.info("SIP participant joined. Generating greeting...")
                await session.generate_reply(instructions=config.INITIAL_GREETING)
            else:
                logger.warning("SIP participant never joined within 30s. Room will close.")
        else:
            logger.info("Web/dashboard session. Greeting immediately...")
            await asyncio.sleep(1)
            await session.generate_reply(instructions=config.WEB_GREETING)

    @ctx.room.on("disconnected")
    def on_disconnect(reason):
        logger.info(f"Room disconnected: {reason}")
        # Build transcript from session history
        try:
            messages = session.history.messages if hasattr(session, 'history') else []
            transcript_text = "\n".join([
                f"{m.role}: {m.content[0].text if isinstance(m.content, list) else m.content}"
                for m in messages if m.content
            ])
        except Exception as e:
            logger.warning(f"Could not extract transcript: {e}")
            transcript_text = ""
        
        logger.info(f"Transcript length: {len(transcript_text)}")
        
        # Send to Webhook async
        async def send_webhook():
            try:
                import aiohttp
                webhook_url = os.getenv("WEBHOOK_URL", "http://localhost:3000/api/hooks/transcript")
                
                payload = {
                    "call_id": config_dict.get("call_id"),
                    "phone": phone_number,
                    "transcript": transcript_text,
                    "status": "COMPLETED",
                    "duration": 0
                }
                
                async with aiohttp.ClientSession() as http_session:
                    async with http_session.post(webhook_url, json=payload) as resp:
                        logger.info(f"Webhook sent: {resp.status}")
                        
            except Exception as e:
                logger.error(f"Failed to send webhook: {e}")

        asyncio.create_task(send_webhook())

class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Server is running")
        
    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()
        
    def log_message(self, format, *args):
        pass # Suppress logging

def _start_health_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), _HealthHandler)
    logger.info(f"Healthcheck server running on port {port}")
    server.serve_forever()

if __name__ == "__main__":
    # Start health server in a background thread
    threading.Thread(target=_start_health_server, daemon=True).start()

    try:
        config.load_dynamic_config()
    except Exception as e:
        logger.warning(f"Failed to load dynamic config: {e}")

    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="outbound-caller", 
        )
    )
