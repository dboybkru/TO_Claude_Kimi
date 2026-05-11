"""Email notification service — async SMTP via aiosmtplib.

Gracefully no-ops when EMAIL_ENABLED=false or SMTP credentials are missing.
"""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Jinja2 template rendering ─────────────────────────────────────────────────

_templates_dir = Path(__file__).resolve().parent.parent / "templates" / "email"
_jinja_env = None


def _get_jinja_env():
    global _jinja_env
    if _jinja_env is None:
        try:
            from jinja2 import Environment, FileSystemLoader
            _jinja_env = Environment(
                loader=FileSystemLoader(str(_templates_dir)),
                autoescape=True,
            )
        except ImportError:
            logger.warning("Jinja2 not installed — email templates will not work")
            _jinja_env = False
    return _jinja_env


def render_template(name: str, context: dict) -> str:
    """Render a Jinja2 email template. Falls back to basic string formatting."""
    env = _get_jinja_env()
    if env is False:
        logger.error("render_template: Jinja2 unavailable, cannot render %s", name)
        return ""
    try:
        template = env.get_template(name)
        return template.render(context)
    except Exception as exc:
        logger.error("render_template failed for %s: %s", name, exc)
        return ""


def _html_to_plain_text(html: str) -> str:
    """Very basic HTML-to-text conversion for plain-text fallback."""
    import re
    text = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\n\s*\n", "\n\n", text).strip()
    return text


def _is_configured() -> bool:
    return settings.EMAIL_ENABLED and bool(settings.SMTP_HOST) and bool(settings.SMTP_USER)


async def send_email(to: str | list[str], subject: str, body_html: str | None = None, body_text: str | None = None) -> bool:
    """Send an email. Returns True on success, False on failure/disabled.

    If body_text is omitted but body_html is provided, a plain-text fallback
    is generated automatically from the HTML.
    """
    if not _is_configured():
        logger.debug("send_email: email disabled or not configured, skipping to=%s subject=%r", to, subject)
        return False

    try:
        import aiosmtplib
    except ImportError:
        logger.warning("send_email: aiosmtplib not installed — pip install aiosmtplib")
        return False

    recipients = [to] if isinstance(to, str) else to
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = ", ".join(recipients)

    html = body_html or ""
    text = body_text or ""
    if html and not text:
        text = _html_to_plain_text(html)

    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_TLS,
        )
        logger.info("send_email: sent to %s subject=%r", recipients, subject)
        return True
    except Exception as exc:
        logger.error("send_email failed to=%s: %s", recipients, exc)
        return False


# ── Predefined templates ──────────────────────────────────────────────────────

_BASE_STYLE = """
<style>
body { font-family: Arial, sans-serif; background: #0f1923; color: #c5d8ea; margin: 0; padding: 20px; }
.card { background: #0d1d2c; border: 1px solid #1e3347; border-radius: 10px; padding: 24px; max-width: 560px; margin: 0 auto; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; }
.critical { background: #3a0f0f; color: #e85d4a; }
.high     { background: #2d1a00; color: #f0a830; }
.normal   { background: #0d2040; color: #62b8f5; }
.green    { background: #0a2518; color: #52c97e; }
h2 { color: #e8f1fa; margin: 0 0 16px; }
p  { margin: 8px 0; font-size: 14px; line-height: 1.5; }
.label { color: #4d7a9e; font-size: 12px; }
a.btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1a7dbd;
        color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
hr { border: none; border-top: 1px solid #1e3347; margin: 20px 0; }
.footer { font-size: 11px; color: #3d5a72; text-align: center; margin-top: 16px; }
</style>
"""


async def notify_critical_ticket(ticket_number: str, title: str, object_name: str,
                                  priority: str, to_emails: list[str], app_url: str = "") -> bool:
    """Notify dispatchers about a new critical/high priority ticket."""
    priority_label = {"critical": "КРИТИЧНО", "high": "ВЫСОКИЙ"}.get(priority, priority.upper())
    priority_class = "critical" if priority == "critical" else "high"

    html = render_template("ticket_created.html", {
        "ticket_number": ticket_number,
        "title": title,
        "object_name": object_name,
        "priority": priority,
        "priority_label": priority_label,
        "priority_class": priority_class,
        "app_url": app_url,
    })
    if not html:
        # Fallback inline template
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="card">
  <h2>🔧 Новая заявка — <span class="{priority_class} badge">{priority_label}</span></h2>
  <p><span class="label">Номер заявки</span><br><strong>{ticket_number}</strong></p>
  <p><span class="label">Объект</span><br>{object_name}</p>
  <p><span class="label">Описание</span><br>{title}</p>
  {'<a class="btn" href="' + app_url + '/tickets">Открыть заявки →</a>' if app_url else ''}
  <hr>
  <div class="footer">SecureTO — Система ТО охранной сигнализации и СКУД</div>
</div></body></html>"""

    text = f"Новая заявка {ticket_number} [{priority_label}]\nОбъект: {object_name}\n{title}"
    return await send_email(to_emails, f"[{priority_label}] Заявка {ticket_number}", html, text)


async def notify_overdue_schedule(object_name: str, scheduled_date: str,
                                   technician_email: str, app_url: str = "") -> bool:
    """Notify technician about overdue maintenance."""
    html = render_template("maintenance_reminder.html", {
        "object_name": object_name,
        "scheduled_date": scheduled_date,
        "app_url": app_url,
        "technician_name": "",
    })
    if not html:
        html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="card">
  <h2>⚠ Просрочено плановое ТО</h2>
  <p><span class="label">Объект</span><br><strong>{object_name}</strong></p>
  <p><span class="label">Дата ТО</span><br>{scheduled_date}</p>
  {'<a class="btn" href="' + app_url + '/schedule">Открыть планировщик →</a>' if app_url else ''}
  <hr><div class="footer">SecureTO</div>
</div></body></html>"""

    text = f"Просрочено ТО: {object_name} (плановая дата: {scheduled_date})"
    return await send_email(technician_email, f"Просрочено ТО: {object_name}", html, text)


async def send_password_reset(to_email: str, reset_token: str, app_url: str) -> bool:
    """Send password reset link."""
    reset_url = f"{app_url}/reset-password?token={reset_token}"
    html = f"""<!DOCTYPE html><html><head>{_BASE_STYLE}</head><body>
<div class="card">
  <h2>🔑 Сброс пароля</h2>
  <p>Вы запросили сброс пароля для аккаунта <strong>{to_email}</strong>.</p>
  <p>Ссылка действительна <strong>1 час</strong>.</p>
  <a class="btn" href="{reset_url}">Сбросить пароль</a>
  <p style="margin-top:16px; font-size:12px; color:#4d7a9e">
    Если вы не запрашивали сброс — проигнорируйте это письмо.
  </p>
  <hr><div class="footer">SecureTO</div>
</div></body></html>"""

    text = f"Сброс пароля SecureTO\nСсылка: {reset_url}\nДействительна 1 час."
    return await send_email(to_email, "Сброс пароля SecureTO", html, text)
