"""AI service powered by VseGPT (OpenAI-compatible API, https://vsegpt.ru).

Uses httpx directly — no openai package required.
Gracefully degrades when VSEGPT_API_KEY is not set.
"""
import json
import logging
import re
from datetime import date
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Shared HTTP client (connection pool) ──────────────────────────────────────
_http_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            base_url=settings.VSEGPT_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.VSEGPT_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=90.0,
        )
    return _http_client


def _is_configured() -> bool:
    return bool(settings.VSEGPT_API_KEY)


async def _chat(
    model: str,
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.3,
    response_format: dict | None = None,
) -> str:
    """POST /chat/completions and return assistant content string."""
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format
    try:
        resp = await _http().post("/chat/completions", content=json.dumps(payload))
        if resp.status_code >= 400:
            logger.error("VseGPT API error %d for model=%s: %s", resp.status_code, model, resp.text[:300])
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except httpx.HTTPStatusError as e:
        logger.error("_chat HTTP error: %s — body: %s", e, e.response.text[:300])
        raise


# ── Text-to-Speech ────────────────────────────────────────────────────────────

async def synthesize_speech(text: str, voice: str = "alloy") -> bytes:
    """Synthesize speech via VseGPT TTS-compatible endpoint."""
    if not _is_configured():
        logger.warning("synthesize_speech: VSEGPT_API_KEY not set")
        return b""
    try:
        resp = await _http().post(
            "/audio/speech",
            content=json.dumps({
                "model": "tts-1",
                "input": text,
                "voice": voice,
                "response_format": "mp3",
            }),
        )
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.error("synthesize_speech failed: %s", exc)
        return b""


# ── Speech-to-Text ────────────────────────────────────────────────────────────

async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.ogg") -> str:
    """Transcribe audio via VseGPT Whisper-compatible STT."""
    if not _is_configured():
        logger.warning("transcribe_audio: VSEGPT_API_KEY not set")
        return ""
    try:
        resp = await _http().post(
            "/audio/transcriptions",
            files={"file": (filename, audio_bytes, "audio/ogg")},
            data={"model": "whisper-1", "language": "ru", "response_format": "text"},
        )
        resp.raise_for_status()
        return resp.text.strip()
    except Exception as exc:
        logger.error("transcribe_audio failed: %s", exc)
        return ""


# ── Call Parsing ──────────────────────────────────────────────────────────────

CALL_PARSE_SCHEMA = {
    "type": "object",
    "properties": {
        "object_name":    {"type": ["string", "null"]},
        "address_hint":   {"type": ["string", "null"]},
        "problem":        {"type": "string"},
        "fault_type":     {"type": ["string", "null"],
                           "enum": ["hardware","software","power","sensor","access","other",None]},
        "priority":       {"type": "string", "enum": ["low","normal","high","critical"]},
        "caller_phone":   {"type": ["string", "null"]},
        "needs_callback": {"type": "boolean"},
        "summary":        {"type": "string"},
    },
    "required": ["problem", "priority", "needs_callback", "summary"],
}

_CALL_PARSE_SYSTEM = """Ты — система анализа звонков в службу ТО охранных систем и СКУД Калининградской области.
Извлеки структурированную информацию из транскрипции.
Приоритеты: critical=угроза безопасности, high=объект без охраны, normal=частичная неисправность, low=вопрос."""


async def parse_call(transcript: str) -> dict[str, Any]:
    """Extract structured info from call transcript. Returns fallback dict on failure."""
    _fallback = {
        "problem": transcript[:500] if transcript else "Неизвестная проблема",
        "priority": "normal", "needs_callback": True,
        "summary": transcript[:200] if transcript else "Нет данных",
        "object_name": None, "address_hint": None, "fault_type": "other", "caller_phone": None,
    }
    if not _is_configured() or not transcript.strip():
        return _fallback
    try:
        content = await _chat(
            model=settings.AI_MODEL_PARSE_CALL,
            messages=[
                {"role": "system", "content": _CALL_PARSE_SYSTEM},
                {"role": "user",   "content": f"Транскрипция звонка:\n\n{transcript}"},
            ],
            response_format={"type": "json_schema",
                             "json_schema": {"name": "call_parse", "schema": CALL_PARSE_SCHEMA}},
            max_tokens=512, temperature=0.1,
        )
        return json.loads(content)
    except Exception as exc:
        logger.error("parse_call failed: %s", exc)
        return _fallback


# ── Fault Classification ──────────────────────────────────────────────────────

_CLASSIFY_SYSTEM = "Классифицируй описание неисправности. Отвечай ТОЛЬКО одним словом: hardware, software, power, sensor, access, other."


async def classify_fault(description: str) -> str:
    if not _is_configured():
        return "other"
    try:
        result = await _chat(
            model=settings.AI_MODEL_CLASSIFY,
            messages=[{"role": "system", "content": _CLASSIFY_SYSTEM},
                      {"role": "user",   "content": description[:1000]}],
            max_tokens=10, temperature=0,
        )
        r = result.strip().lower()
        return r if r in {"hardware","software","power","sensor","access","other"} else "other"
    except Exception as exc:
        logger.error("classify_fault failed: %s", exc)
        return "other"


# ── Journal Summary ───────────────────────────────────────────────────────────

_SUMMARIZE_SYSTEM = """Ты — технический редактор. Напиши профессиональное резюме журнала ТО (3-5 предложений).
Включи: что проверено, что выявлено, статус системы, рекомендации. Язык: русский."""


async def summarize_journal(object_name: str, checklist: list[dict] | None,
                             result_description: str | None, system_status: str | None) -> str:
    if not _is_configured():
        return result_description or "Техническое обслуживание выполнено."
    checklist_text = ""
    if checklist:
        done = sum(1 for i in checklist if i.get("done"))
        checklist_text = f"Чеклист: {done}/{len(checklist)} пунктов.\n"
    status_text = {"operational":"Работоспособна","repaired":"Отремонтирована",
                   "needs_repair":"Требует ремонта"}.get(system_status or "", system_status or "")
    prompt = (f"Объект: {object_name}\nСтатус: {status_text}\n"
              f"{checklist_text}Работы: {result_description or 'не указано'}")
    try:
        return (await _chat(settings.AI_MODEL_SUMMARIZE,
                            [{"role":"system","content":_SUMMARIZE_SYSTEM},
                             {"role":"user","content":prompt}],
                            max_tokens=300, temperature=0.3)).strip()
    except Exception as exc:
        logger.error("summarize_journal failed: %s", exc)
        return result_description or "Техническое обслуживание выполнено."


# ── Maintenance Report ────────────────────────────────────────────────────────

_REPORT_SYSTEM = """Ты — аналитик ТО. Составь отчёт по объекту (русский, деловой стиль).
Структура: техническое состояние → выявленные проблемы → выполненные работы → рекомендации."""


async def generate_object_report(object_name: str, object_type: str,
                                  journals_summary: list[str], open_tickets: int) -> str:
    if not _is_configured():
        return f"Отчёт по объекту {object_name}: данные недоступны (AI не настроен)."
    journals_text = "\n".join(f"- {s}" for s in journals_summary[:10])
    prompt = (f"Объект: {object_name} (тип: {object_type})\n"
              f"Открытых заявок: {open_tickets}\n"
              f"Журналы ТО:\n{journals_text or 'нет данных'}")
    try:
        return (await _chat(settings.AI_MODEL_REPORT,
                            [{"role":"system","content":_REPORT_SYSTEM},
                             {"role":"user","content":prompt}],
                            max_tokens=800, temperature=0.4)).strip()
    except Exception as exc:
        logger.error("generate_object_report failed: %s", exc)
        return f"Ошибка генерации отчёта: {exc}"


# ── Quick Hint (form suggestions) ────────────────────────────────────────────

_HINT_SYSTEM = "Анализируй описание неисправности охранной системы. Отвечай ТОЛЬКО JSON."

_HINT_SCHEMA = {
    "type": "object",
    "properties": {
        "priority":   {"type": "string", "enum": ["low","normal","high","critical"]},
        "fault_type": {"type": "string", "enum": ["hardware","software","power","sensor","access","other"]},
        "title":      {"type": "string"},
    },
    "required": ["priority","fault_type","title"],
}


async def ticket_hint(description: str) -> dict:
    if not _is_configured() or len(description.strip()) < 10:
        return {}
    try:
        content = await _chat(
            model=settings.AI_MODEL_HINT,
            messages=[{"role":"system","content":_HINT_SYSTEM},
                      {"role":"user","content":f"Проблема: {description[:500]}"}],
            response_format={"type":"json_schema","json_schema":{"name":"hint","schema":_HINT_SCHEMA}},
            max_tokens=120, temperature=0,
        )
        return json.loads(content)
    except Exception as exc:
        logger.debug("ticket_hint failed: %s", exc)
        return {}


# ── Local Fallback: RapidFuzz Address Matching ───────────────────────────────

def _normalize_address(text: str) -> str:
    """Normalize address for fuzzy comparison."""
    replacements = {
        'улица': 'ул', 'проспект': 'пр', 'переулок': 'пер',
        'поселок': 'п', 'посёлок': 'п', 'город': 'г',
        'деревня': 'д', 'район': 'р-н',
    }
    text = text.lower()
    for k, v in replacements.items():
        text = text.replace(k, v)
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def fuzzy_match_address(address_hint: str, known_objects: list[dict], threshold: float = 75.0) -> tuple[str | None, float]:
    """Local fallback address matching using rapidfuzz.
    Returns (object_id, score) or (None, 0).
    """
    try:
        from rapidfuzz import fuzz
    except ImportError:
        return None, 0.0

    if not address_hint or not known_objects:
        return None, 0.0

    normalized_hint = _normalize_address(address_hint)
    best_match = None
    best_score = 0.0

    for obj in known_objects:
        # Match against name + address + aliases
        candidates = [obj.get("name", ""), obj.get("address", "")]
        aliases = obj.get("address_aliases", [])
        if isinstance(aliases, list):
            candidates.extend(aliases)

        for candidate in candidates:
            normalized_candidate = _normalize_address(candidate)
            # Token sort ratio handles word order differences
            score = fuzz.token_sort_ratio(normalized_hint, normalized_candidate)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = obj.get("id")

    return best_match, best_score


# ── Address Matching (AI + Local Fallback) ─────────────────────────────────────

async def match_object_address(address_hint: str, known_objects: list[dict]) -> str | None:
    """Match address using VseGPT AI first, fallback to rapidfuzz."""
    if not known_objects:
        return None

    # Try AI matching first if configured
    if _is_configured():
        try:
            objects_text = "\n".join(
                f"{i+1}. ID={o['id']} | {o['name']} | {o['address']}"
                for i, o in enumerate(known_objects[:50])
            )
            prompt = (f"Адрес из звонка: «{address_hint}»\n\nОбъекты:\n{objects_text}\n\n"
                      "Ответь ТОЛЬКО UUID совпадающего объекта или null.")
            result = (await _chat(settings.AI_MODEL_CLASSIFY,
                                  [{"role": "user", "content": prompt}],
                                  max_tokens=50, temperature=0)).strip()
            if result.lower() not in ("null", "none", ""):
                m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", result, re.I)
                if m:
                    return m.group(0)
        except Exception as exc:
            logger.warning("AI address matching failed, falling back to rapidfuzz: %s", exc)

    # Fallback to local rapidfuzz
    obj_id, score = fuzzy_match_address(address_hint, known_objects, threshold=75.0)
    if obj_id:
        logger.info("rapidfuzz matched address '%s' to object %s (score=%.1f)", address_hint, obj_id, score)
    return obj_id


# ═══════════════════════════════════════════════════════════════════════════════
# ADVANCED AI FEATURES
# ═══════════════════════════════════════════════════════════════════════════════

# ── Daily Digest ──────────────────────────────────────────────────────────────

_DIGEST_SYSTEM = """Ты — аналитик системы технического обслуживания охранных систем.
Составь краткий ежедневный дайджест на русском языке для руководителя.
Структура: 🔴 Критично → 🟡 Требует внимания → ✅ Норма → 📋 Рекомендации.
Стиль: деловой, лаконичный, конкретный. Выдели самое важное."""


async def summarize_day(date_obj: date, journals: list[dict] | None = None) -> str:
    """Summarize a day's maintenance journals using AI.

    Args:
        date_obj: The date being summarized.
        journals: List of journal dicts with keys like object_name, status,
                  result_description, technician_name.
    """
    if not _is_configured():
        return ""
    journals = journals or []
    if not journals:
        return f"За {date_obj.strftime('%d.%m.%Y')} журналов ТО не найдено."

    lines = []
    for idx, j in enumerate(journals[:20], 1):
        lines.append(
            f"{idx}. Объект: {j.get('object_name', 'неизвестно')}\n"
            f"   Статус: {j.get('status', 'не указан')}\n"
            f"   Техник: {j.get('technician_name', 'не указан')}\n"
            f"   Работы: {(j.get('result_description') or 'не указано')[:200]}"
        )

    prompt = (
        f"Дата: {date_obj.strftime('%d.%m.%Y')}\n"
        f"Количество журналов: {len(journals)}\n\n"
        f"Журналы:\n" + "\n".join(lines)
    )

    try:
        return (await _chat(
            settings.AI_MODEL_SUMMARIZE,
            [{"role": "system", "content": _DIGEST_SYSTEM},
             {"role": "user", "content": prompt}],
            max_tokens=600, temperature=0.3,
        )).strip()
    except Exception as exc:
        logger.error("summarize_day failed: %s", exc)
        return ""


async def daily_digest(
    total_objects: int,
    active_objects: int,
    overdue_schedules: int,
    open_tickets: int,
    critical_tickets: int,
    high_tickets: int,
    done_this_month: int,
    planned_this_month: int,
    overdue_objects: list[dict],   # [{"name": str, "days": int, "region": str}]
    critical_ticket_list: list[dict],  # [{"number": str, "title": str, "object": str}]
    recent_journals: list[dict],   # [{"object": str, "status": str, "tech": str}]
) -> str:
    if not _is_configured():
        return "AI дайджест недоступен: не настроен VSEGPT_API_KEY."

    overdue_txt = "\n".join(
        f"  • {o['name']} ({o.get('region','')}) — {o.get('days',0)} дн. без ТО"
        for o in overdue_objects[:10]
    ) or "  нет"

    critical_txt = "\n".join(
        f"  • [{t['number']}] {t['title']} — {t.get('object','')}"
        for t in critical_ticket_list[:5]
    ) or "  нет"

    journals_txt = "\n".join(
        f"  • {j['object']}: {j['status']} (техник: {j['tech']})"
        for j in recent_journals[:5]
    ) or "  нет"

    to_pct = round(done_this_month / max(planned_this_month, 1) * 100)

    prompt = f"""ДАННЫЕ НА {__import__('datetime').date.today().strftime('%d.%m.%Y')}:

Объекты: {total_objects} всего, {active_objects} активных
ТО в месяце: {done_this_month}/{planned_this_month} ({to_pct}%)
Просрочено ТО: {overdue_schedules} объектов
Открытые заявки: {open_tickets} (критичных: {critical_tickets}, высоких: {high_tickets})

Объекты с просроченным ТО:
{overdue_txt}

Критичные/высокие заявки:
{critical_txt}

Последние ТО (журналы за 24ч):
{journals_txt}
"""
    try:
        return (await _chat(
            settings.AI_MODEL_REPORT,
            [{"role": "system", "content": _DIGEST_SYSTEM},
             {"role": "user", "content": prompt}],
            max_tokens=1000, temperature=0.3,
        )).strip()
    except Exception as exc:
        logger.error("daily_digest failed: %s", exc)
        return f"Ошибка генерации дайджеста: {exc}"


# ── Similar Tickets ───────────────────────────────────────────────────────────

_SIMILAR_SYSTEM = """Ты — помощник технического обслуживания охранных систем.
На вход: описание новой проблемы и список прошлых заявок с их решениями.
Найди 1-3 наиболее похожих случая и объясни как они помогут решить текущую проблему.
Если аналогов нет — скажи прямо. Язык: русский, кратко."""


async def find_similar_tickets(
    new_title: str,
    new_description: str,
    fault_type: str | None,
    past_tickets: list[dict],  # [{"number", "title", "fault_type", "resolution_notes", "object_name"}]
) -> str:
    if not _is_configured() or not past_tickets:
        return ""

    past_txt = "\n".join(
        f"{i+1}. [{t['number']}] {t['title']} | {t.get('fault_type','')} | "
        f"Объект: {t.get('object_name','?')} | "
        f"Решение: {(t.get('resolution_notes') or 'нет')[:100]}"
        for i, t in enumerate(past_tickets[:20])
    )
    prompt = (
        f"Новая проблема: {new_title}\n"
        f"Описание: {new_description or 'нет'}\n"
        f"Тип: {fault_type or 'не указан'}\n\n"
        f"База прошлых заявок:\n{past_txt}"
    )
    try:
        return (await _chat(
            settings.AI_MODEL_SUMMARIZE,
            [{"role": "system", "content": _SIMILAR_SYSTEM},
             {"role": "user", "content": prompt}],
            max_tokens=400, temperature=0.2,
        )).strip()
    except Exception as exc:
        logger.error("find_similar_tickets failed: %s", exc)
        return ""


# ── Journal Assistant (free text → structured fields) ────────────────────────

_JOURNAL_ASSIST_SYSTEM = """Ты — помощник технического обслуживания охранных систем и СКУД.
Монтажник описал выполненную работу в свободной форме.
Извлеки структурированные данные для журнала ТО. Отвечай ТОЛЬКО JSON."""

_JOURNAL_ASSIST_SCHEMA = {
    "type": "object",
    "properties": {
        "result_description": {"type": "string", "description": "Описание выполненных работ (2-4 предложения)"},
        "system_status":      {"type": "string", "enum": ["operational", "repaired", "needs_repair"]},
        "final_statement":    {"type": "string", "description": "Итоговое заключение (1 предложение)"},
        "recommended_actions":{"type": "string", "description": "Рекомендации для следующего ТО (если есть)"},
        "parts_used":         {"type": "string", "description": "Использованные запчасти/материалы"},
    },
    "required": ["result_description", "system_status", "final_statement"],
}


async def journal_assist(
    free_text: str,
    object_name: str,
    object_type: str,
) -> dict:
    """Convert technician's free-text description to structured journal fields."""
    if not _is_configured() or len(free_text.strip()) < 10:
        return {}
    prompt = (
        f"Объект: {object_name} (тип: {object_type})\n"
        f"Описание от монтажника: {free_text}"
    )
    try:
        content = await _chat(
            settings.AI_MODEL_SUMMARIZE,
            [{"role": "system", "content": _JOURNAL_ASSIST_SYSTEM},
             {"role": "user", "content": prompt}],
            response_format={"type": "json_schema",
                             "json_schema": {"name": "journal_assist",
                                             "schema": _JOURNAL_ASSIST_SCHEMA}},
            max_tokens=400, temperature=0.2,
        )
        return json.loads(content)
    except Exception as exc:
        logger.error("journal_assist failed: %s", exc)
        return {}


# ── Smart Technician Assignment ───────────────────────────────────────────────

_TECH_SUGGEST_SYSTEM = """Ты — диспетчер технического обслуживания.
По описанию проблемы, типу объекта и истории работы монтажников выбери наилучшего исполнителя.
Объясни выбор в 1-2 предложениях. Язык: русский."""


async def suggest_technician(
    ticket_title: str,
    fault_type: str | None,
    object_type: str,
    object_region: str | None,
    technicians: list[dict],  # [{"id", "name", "completed_this_month", "specialization_hint"}]
) -> dict:
    """Return {"technician_id": str, "reason": str} or empty dict."""
    if not _is_configured() or not technicians:
        return {}

    tech_txt = "\n".join(
        f"{i+1}. {t['name']} — выполнено в месяце: {t.get('completed_this_month',0)}, "
        f"специализация: {t.get('specialization_hint','общая')}"
        for i, t in enumerate(technicians[:10])
    )
    prompt = (
        f"Проблема: {ticket_title}\n"
        f"Тип неисправности: {fault_type or 'не указан'}\n"
        f"Тип объекта: {object_type}, Район: {object_region or 'не указан'}\n\n"
        f"Доступные монтажники:\n{tech_txt}\n\n"
        "Выбери наилучшего монтажника. Ответь JSON: {\"index\": N, \"reason\": \"...\"}  "
        "где index — номер из списка (1-based)."
    )
    try:
        content = await _chat(
            settings.AI_MODEL_CLASSIFY,
            [{"role": "system", "content": _TECH_SUGGEST_SYSTEM},
             {"role": "user", "content": prompt}],
            max_tokens=150, temperature=0.1,
        )
        data = json.loads(content)
        idx = int(data.get("index", 1)) - 1
        if 0 <= idx < len(technicians):
            return {"technician_id": technicians[idx]["id"],
                    "technician_name": technicians[idx]["name"],
                    "reason": data.get("reason", "")}
        return {}
    except Exception as exc:
        logger.error("suggest_technician failed: %s", exc)
        return {}


# ── Predictive Maintenance ────────────────────────────────────────────────────

_PREDICTIVE_SYSTEM = """Ты — аналитик предиктивного обслуживания охранных систем.
На основе истории ТО и заявок определи риск отказа объекта в ближайший месяц.
Ответь JSON с полями risk_level (low/medium/high/critical), reason (строка), recommended_action (строка)."""

_PREDICTIVE_SCHEMA = {
    "type": "object",
    "properties": {
        "risk_level":          {"type": "string", "enum": ["low", "medium", "high", "critical"]},
        "reason":              {"type": "string"},
        "recommended_action":  {"type": "string"},
        "days_until_critical": {"type": ["integer", "null"]},
    },
    "required": ["risk_level", "reason", "recommended_action"],
}


async def predictive_maintenance(
    object_name: str,
    object_type: str,
    last_maintenance_days_ago: int | None,
    open_tickets: int,
    system_statuses: list[str],  # last N journal statuses
    repeat_fault_types: list[str],  # fault types that repeat
) -> dict:
    if not _is_configured():
        return {"risk_level": "unknown", "reason": "AI не настроен", "recommended_action": ""}

    statuses_txt = ", ".join(system_statuses[-5:]) if system_statuses else "нет данных"
    faults_txt   = ", ".join(set(repeat_fault_types)) if repeat_fault_types else "нет"
    last_to      = f"{last_maintenance_days_ago} дней назад" if last_maintenance_days_ago else "нет данных"

    prompt = (
        f"Объект: {object_name} (тип: {object_type})\n"
        f"Последнее ТО: {last_to}\n"
        f"Открытых заявок: {open_tickets}\n"
        f"Статусы последних журналов: {statuses_txt}\n"
        f"Повторяющиеся типы неисправностей: {faults_txt}"
    )
    try:
        content = await _chat(
            settings.AI_MODEL_SUMMARIZE,
            [{"role": "system", "content": _PREDICTIVE_SYSTEM},
             {"role": "user", "content": prompt}],
            response_format={"type": "json_schema",
                             "json_schema": {"name": "predictive", "schema": _PREDICTIVE_SCHEMA}},
            max_tokens=200, temperature=0.1,
        )
        return json.loads(content)
    except Exception as exc:
        logger.error("predictive_maintenance failed: %s", exc)
        return {"risk_level": "unknown", "reason": str(exc), "recommended_action": ""}


# ── Service namespace for imports ─────────────────────────────────────────────

class AIService:
    """Namespace object to expose key AI functions as methods."""
    summarize_day = staticmethod(summarize_day)
    daily_digest = staticmethod(daily_digest)
    summarize_journal = staticmethod(summarize_journal)
    classify_fault = staticmethod(classify_fault)
    parse_call = staticmethod(parse_call)
    match_object_address = staticmethod(match_object_address)
    fuzzy_match_address = staticmethod(fuzzy_match_address)
    generate_object_report = staticmethod(generate_object_report)
    ticket_hint = staticmethod(ticket_hint)
    find_similar_tickets = staticmethod(find_similar_tickets)
    journal_assist = staticmethod(journal_assist)
    suggest_technician = staticmethod(suggest_technician)
    predictive_maintenance = staticmethod(predictive_maintenance)
    transcribe_audio = staticmethod(transcribe_audio)
    synthesize_speech = staticmethod(synthesize_speech)


ai_service = AIService()
