"""Email sending via SMTP.

Uses the standard library smtplib + asyncio.to_thread for async compat.
Falls back gracefully (logs warning) when SMTP is not configured.
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    s = get_settings()
    return bool(s.SMTP_HOST and s.SMTP_USER and s.SMTP_PASSWORD)


def _send_email_sync(to: str, subject: str, html_body: str) -> None:
    """Send a single email synchronously."""
    s = get_settings()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = s.SMTP_FROM or s.SMTP_USER
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=30) as server:
        server.ehlo()
        if s.SMTP_PORT != 25:
            server.starttls()
            server.ehlo()
        server.login(s.SMTP_USER, s.SMTP_PASSWORD)
        server.sendmail(msg["From"], [to], msg.as_string())


async def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an email asynchronously. Returns True on success, False on failure."""
    if not _smtp_configured():
        logger.warning("SMTP not configured — email to %s not sent", to)
        return False
    try:
        await asyncio.to_thread(_send_email_sync, to, subject, html_body)
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


async def send_password_reset_email(to: str, reset_token: str) -> bool:
    """Send password reset email with token link."""
    s = get_settings()
    # Derive frontend URL from CORS origins (first one)
    frontend_url = "https://your-domain.com"
    if s.BACKEND_CORS_ORIGINS:
        frontend_url = s.BACKEND_CORS_ORIGINS[0].rstrip("/")

    reset_link = f"{frontend_url}/reset-password?token={reset_token}"

    html = f"""\
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1a1a1a;">Resetiranje lozinke</h2>
  <p>Primili smo zahtjev za resetiranje vaše lozinke za Riforma račun.</p>
  <p>
    <a href="{reset_link}"
       style="display: inline-block; padding: 12px 24px; background: #2563eb;
              color: #fff; text-decoration: none; border-radius: 6px;
              font-weight: 600;">
      Resetiraj lozinku
    </a>
  </p>
  <p style="color: #6b7280; font-size: 14px;">
    Ako niste zatražili resetiranje, možete ignorirati ovaj email.<br>
    Link vrijedi 1 sat.
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
  <p style="color: #9ca3af; font-size: 12px;">Riforma — Upravljanje nekretninama</p>
</body>
</html>"""

    return await send_email(to, "Riforma — Resetiranje lozinke", html)
