#!/usr/bin/env python3
"""
Asterisk AGI Voice Bot for SecureTO
Handles incoming calls: RECORD FILE → STT → fuzzy address match → TTS responses → ticket creation → MinIO upload.
"""
import sys
import os
import subprocess
import uuid
from datetime import datetime

import httpx

from storage_service import storage_service

# ── Config ───────────────────────────────────────────────────────────────────
VSEGPT_API_KEY = os.environ.get("VSEGPT_API_KEY", "")
VSEGPT_URL = os.environ.get("VSEGPT_BASE_URL", "https://api.vsegpt.ru/v1")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://backend:8000")
ROBOT_API_KEY = os.environ.get("ROBOT_API_KEY", "")

# ── AGI helpers ──────────────────────────────────────────────────────────────

def agi_get_variable(name: str) -> str:
    """Read Asterisk channel variable."""
    sys.stdout.write(f"GET VARIABLE {name}\n")
    sys.stdout.flush()
    line = sys.stdin.readline().strip()
    if line.startswith("200 result=1"):
        return line.split("(")[1].rstrip(")")
    return ""


def agi_set_variable(name: str, value: str) -> None:
    sys.stdout.write(f"SET VARIABLE {name} \"{value}\"\n")
    sys.stdout.flush()
    sys.stdin.readline()


def agi_answer() -> None:
    sys.stdout.write("ANSWER\n")
    sys.stdout.flush()
    sys.stdin.readline()


def agi_hangup() -> None:
    sys.stdout.write("HANGUP\n")
    sys.stdout.flush()
    sys.stdin.readline()


def agi_stream_file(filename: str) -> None:
    sys.stdout.write(f"STREAM FILE {filename} \"#\"\n")
    sys.stdout.flush()
    sys.stdin.readline()


def agi_record_file(filename: str, timeout_ms: int = 10000) -> None:
    """Record audio from caller. Format 'wav' = 8000 Hz mono 16-bit PCM."""
    sys.stdout.write(f"RECORD FILE {filename} wav \"#\" {timeout_ms} 0 BEEP\n")
    sys.stdout.flush()
    sys.stdin.readline()


# ── TTS ──────────────────────────────────────────────────────────────────────

def agi_synthesize_response(text: str, filename_prefix: str) -> str:
    """
    Generate TTS audio via VseGPT, convert MP3→WAV (8000 Hz, mono, 16-bit),
    play via STREAM FILE, and return the WAV path (or "" on failure).
    """
    if not VSEGPT_API_KEY:
        print("TTS skipped: no VSEGPT_API_KEY", file=sys.stderr)
        return ""

    tmp_mp3 = f"/tmp/{filename_prefix}_{uuid.uuid4().hex}.mp3"
    tmp_wav = tmp_mp3.replace(".mp3", ".wav")

    try:
        # 1. Synthesize via VseGPT TTS API
        resp = httpx.post(
            f"{VSEGPT_URL}/audio/speech",
            headers={"Authorization": f"Bearer {VSEGPT_API_KEY}"},
            json={"model": "tts-1", "input": text, "voice": "alloy"},
            timeout=30,
        )
        resp.raise_for_status()

        with open(tmp_mp3, "wb") as f:
            f.write(resp.content)

        # 2. Convert to Asterisk-compatible WAV via ffmpeg
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", tmp_mp3,
                "-ar", "8000", "-ac", "1", "-acodec", "pcm_s16le",
                tmp_wav,
            ],
            capture_output=True,
            check=True,
        )

        # 3. Play to caller
        agi_stream_file(tmp_wav.replace(".wav", ""))
        return tmp_wav

    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)
        return ""
    finally:
        for p in (tmp_mp3, tmp_wav):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except Exception:
                pass


# ── STT ──────────────────────────────────────────────────────────────────────

def _transcribe_audio(filepath: str) -> str:
    """STT via VseGPT Whisper API."""
    if not VSEGPT_API_KEY:
        return ""
    try:
        with open(filepath, "rb") as f:
            resp = httpx.post(
                f"{VSEGPT_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {VSEGPT_API_KEY}"},
                files={"file": ("audio.wav", f, "audio/wav")},
                data={"model": "whisper-1", "language": "ru"},
                timeout=60,
            )
        resp.raise_for_status()
        return resp.json().get("text", "")
    except Exception as e:
        print(f"STT error: {e}", file=sys.stderr)
        return ""


def agi_record_and_transcribe(filename_prefix: str, timeout_ms: int = 30000) -> dict:
    """
    Record audio from caller, transcribe via VseGPT Whisper,
    upload recording to MinIO via storage_service.upload(),
    return {"text": ..., "recording_url": ...}.
    """
    # Use Asterisk-compatible temp path (no extension for RECORD FILE)
    base_name = f"/tmp/{filename_prefix}_{uuid.uuid4().hex}"
    record_path = f"{base_name}.wav"

    try:
        # 1. RECORD FILE (WAV, 8000 Hz, mono, 30 s max)
        agi_record_file(base_name, timeout_ms)

        if not os.path.exists(record_path):
            print(f"Recording file not found: {record_path}", file=sys.stderr)
            return {"text": "", "recording_url": ""}

        # 2. STT
        text = _transcribe_audio(record_path)

        # 3. Upload to MinIO
        with open(record_path, "rb") as f:
            data = f.read()
        object_name = f"recordings/{filename_prefix}_{uuid.uuid4().hex}.wav"
        recording_url = storage_service.upload(object_name, data, "audio/wav")

        return {"text": text, "recording_url": recording_url}

    except Exception as e:
        print(f"Record/transcribe error: {e}", file=sys.stderr)
        return {"text": "", "recording_url": ""}
    finally:
        try:
            if os.path.exists(record_path):
                os.unlink(record_path)
        except Exception:
            pass


# ── Backend helpers ──────────────────────────────────────────────────────────

def _backend_headers() -> dict:
    return {
        "Authorization": f"Bearer {ROBOT_API_KEY}",
        "Content-Type": "application/json",
    }


def search_objects(query: str) -> list[dict]:
    """
    Fuzzy search objects via backend GET /api/v1/objects/search.
    Backend already filters score >= 75. Returns list sorted by score desc.
    """
    try:
        resp = httpx.get(
            f"{BACKEND_URL}/api/v1/objects/search",
            headers=_backend_headers(),
            params={"q": query, "limit": 10},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Object search error: {e}", file=sys.stderr)
        return []


def create_ticket(data: dict) -> dict:
    """Create repair ticket via backend POST /api/v1/tickets/."""
    try:
        resp = httpx.post(
            f"{BACKEND_URL}/api/v1/tickets/",
            headers=_backend_headers(),
            json=data,
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Ticket create error: {e}", file=sys.stderr)
        return {}


def update_ticket_status(ticket_id: str, status: str) -> dict:
    """Update ticket status (e.g. to callback_required)."""
    try:
        resp = httpx.put(
            f"{BACKEND_URL}/api/v1/tickets/{ticket_id}",
            headers=_backend_headers(),
            json={"status": status},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Ticket update error: {e}", file=sys.stderr)
        return {}


def add_callback_queue(caller_phone: str, called_at: str, description: str, recording_url: str = "") -> dict:
    """Create a ticket and mark it as callback_required."""
    desc = description
    if recording_url:
        desc += f"\n\nЗапись звонка: {recording_url}"
    ticket_data = {
        "source": "voice_bot",
        "caller_phone": caller_phone,
        "called_at": called_at,
        "description": desc,
        "status": "new",
        "priority": "normal",
        "title": f"Голосовая заявка (требуется уточнение) {caller_phone}",
    }
    ticket = create_ticket(ticket_data)
    ticket_id = ticket.get("id")
    if ticket_id:
        update_ticket_status(ticket_id, "callback_required")
    return ticket


# ── Main flow ────────────────────────────────────────────────────────────────

def main():
    caller_phone = sys.argv[1] if len(sys.argv) > 1 else agi_get_variable("CALLERID(num)")
    called_at = sys.argv[2] if len(sys.argv) > 2 else datetime.utcnow().isoformat()

    agi_answer()

    # ---- Step 1: Greeting (TTS) --------------------------------------------
    agi_synthesize_response(
        "Здравствуйте, служба технического обслуживания. Опишите, пожалуйста, адрес объекта.",
        "greeting",
    )

    # ---- Step 2: Record + STT (30 s max) -----------------------------------
    result = agi_record_and_transcribe("address", 30000)
    transcript = result.get("text", "")
    recording_url = result.get("recording_url", "")

    # ---- Step 3: Fuzzy match address -----------------------------------------
    matches = search_objects(transcript) if transcript else []
    matched_object = matches[0] if matches else None

    object_id = None
    object_address = None
    confirmed = False

    if matched_object:
        object_id = matched_object.get("id")
        object_address = matched_object.get("address")

        # ---- Step 4: Confirm with subscriber (TTS + record) ----------------
        confirm_text = f"Объект найден: {object_address}. Верно?"
        agi_synthesize_response(confirm_text, "confirm_object")

        confirm_result = agi_record_and_transcribe("confirmation", 10000)
        confirmation_text = confirm_result.get("text", "").lower()

        if "да" in confirmation_text or "верно" in confirmation_text or "угадал" in confirmation_text:
            confirmed = True
        else:
            confirmed = False

    # ---- Step 5: Create ticket or add to callback queue ---------------------
    if confirmed and object_id:
        ticket_data = {
            "source": "voice_bot",
            "caller_phone": caller_phone,
            "called_at": called_at,
            "description": transcript or "Заявка от голосового робота",
            "object_id": object_id,
            "status": "new",
            "priority": "normal",
            "title": f"Голосовая заявка {caller_phone}",
        }
        ticket = create_ticket(ticket_data)
        ticket_number = ticket.get("ticket_number", "N/A")

        # ---- Step 6: TTS success -------------------------------------------
        agi_synthesize_response(
            f"Ваша заявка принята, номер {ticket_number}. Мастер выедет в течение двух часов.",
            "success",
        )
    else:
        # Address not recognised → callback queue
        ticket = add_callback_queue(
            caller_phone=caller_phone,
            called_at=called_at,
            description=transcript or "Адрес не распознан. Заявка от голосового робота.",
            recording_url=recording_url,
        )
        ticket_number = ticket.get("ticket_number", "N/A")

        # ---- Step 6: TTS not recognised -------------------------------------
        agi_synthesize_response(
            "Адрес не распознан. Ваш вызов будет обработан вручную.",
            "not_recognized",
        )

    # Set AGI variables for Asterisk dialplan
    agi_set_variable("VOICEBOT_TICKET_NUMBER", str(ticket_number) if ticket_number else "")
    agi_set_variable("VOICEBOT_OBJECT_ID", str(object_id) if object_id else "")
    agi_set_variable("VOICEBOT_TRANSCRIPT", transcript or "")

    agi_hangup()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"AGI fatal error: {e}", file=sys.stderr)
        agi_hangup()
        sys.exit(1)
