import os
import requests
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("config")

# =========================================================================================
#  🤖 AI AGENT CONFIGURATION
#  Use this file to customize your agent's personality, models, and behavior.
# =========================================================================================

# --- 1. AGENT PERSONA & PROMPTS ---
SYSTEM_PROMPT = """
You are a helpful and polite School Receptionist at "Rapid X High School".

**Your Goal:** Answer questions from parents about admissions, fees, and timings.

**Key Behaviors:**
1. **Multilingual:** You speak fluent English AND Hindi. IMPORTANT: If the user speaks Hindi or mixes Hindi words, you MUST reply entirely in Hindi. If they speak English, reply in English. Mirror the language the user uses.
2. **Polite & Warm:** Always be welcomed and respectful.
3. **Be Concise:** Keep answers short (1-2 sentences). Do NOT translate your answer - use the SAME language the user spoke in.
4. **Admissions:** If asked about admissions, say they are open for Grade 1 to 10 and ask if they want to schedule a visit.
5. **Fees:** If asked about fees, say "Please visit the school office for exact details, but it starts at roughly 50k per year."

**CRITICAL:**
- Only use `transfer_call` if they explicitly ask to talk to the Principal or Admin.
- If they say "Bye", say "Namaste" or "Goodbye" and end the call.
"""

INITIAL_GREETING = "The user has picked up the call. Introduce yourself as the School Receptionist immediately."
WEB_GREETING = "Hello! I am the AI Assistant. How can I help you today?"

# --- 2. SPEECH-TO-TEXT (STT) SETTINGS ---
STT_PROVIDER = "deepgram"
STT_MODEL = "nova-2"       # nova-2 supports Hindi + English well
STT_LANGUAGE = "hi"        # "hi" = Hindi base enables Hindi+English code-switching
                           # detect_language=True in agent.py handles per-utterance detection

# --- 3. TEXT-TO-SPEECH (TTS) SETTINGS ---
DEFAULT_TTS_PROVIDER = "sarvam"   # Sarvam supports Hindi + English natively
DEFAULT_TTS_VOICE = "anushka"    # Default Sarvam voice (bulbul:v2 female)

# Sarvam AI Specifics (for Indian Context)
SARVAM_MODEL = "bulbul:v2"
SARVAM_LANGUAGE = "en-IN"  # Starting language; auto-switched to hi-IN when Hindi detected

# Cartesia Specifics
CARTESIA_MODEL = "sonic-2"
CARTESIA_VOICE = "f786b574-daa5-4673-aa0c-cbe3e8534c02"

# OpenAI TTS
OPENAI_TTS_MODEL = "tts-1"
OPENAI_TTS_VOICE = "alloy"

# --- 4. LARGE LANGUAGE MODEL (LLM) SETTINGS ---
DEFAULT_LLM_PROVIDER = "groq"
DEFAULT_LLM_MODEL = "gpt-4o-mini"

# Groq Specifics
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_TEMPERATURE = 0.7

# --- 5. TELEPHONY & TRANSFERS ---
DEFAULT_TRANSFER_NUMBER = os.getenv("DEFAULT_TRANSFER_NUMBER")
SIP_TRUNK_ID = os.getenv("VOICELINK_SIP_TRUNK_ID")
SIP_DOMAIN = os.getenv("VOICELINK_SIP_DOMAIN", "160.30.71.89:3300")

def load_dynamic_config():
    """
    Fetches configuration directly from Supabase using REST API (BYOK).
    """
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        logger.warning("Supabase credentials missing. Cannot load BYOK settings.")
        return
    
    api_url = f"{supabase_url}/rest/v1/app_settings?select=*"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}"
    }
    
    try:
        logger.info(f"Fetching BYOK config from Supabase...")
        resp = requests.get(api_url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if len(data) > 0:
                settings = data[0]
                
                # Apply API keys to environment for LiveKit/AI plugins
                if settings.get("livekit_url"): os.environ["LIVEKIT_URL"] = settings["livekit_url"]
                if settings.get("livekit_api_key"): os.environ["LIVEKIT_API_KEY"] = settings["livekit_api_key"]
                if settings.get("livekit_api_secret"): os.environ["LIVEKIT_API_SECRET"] = settings["livekit_api_secret"]
                
                if settings.get("gemini_api_key"): os.environ["GEMINI_API_KEY"] = settings["gemini_api_key"]
                if settings.get("sarvam_api_key"): os.environ["SARVAM_API_KEY"] = settings["sarvam_api_key"]
                
                global SIP_TRUNK_ID
                if settings.get("livekit_sip_trunk_id"): SIP_TRUNK_ID = settings["livekit_sip_trunk_id"]
                
                logger.info("BYOK Configuration successfully loaded from Supabase.")
            else:
                logger.warning("No app_settings found in Supabase.")
        else:
            logger.warning(f"Failed to fetch config: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"Could not fetch dynamic config from Supabase: {e}")
