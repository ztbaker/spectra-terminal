"""Resend email delivery.

Single entry point: send_email(to, subject, html). Failures raise
EmailSendError so the caller can decide whether to surface or swallow.
"""
from __future__ import annotations

import logging

import httpx

from config import settings

log = logging.getLogger(__name__)


class EmailSendError(RuntimeError):
    pass


_RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> str:
    """Send transactional email via Resend. Returns the Resend message id."""
    if not settings.RESEND_API_KEY:
        raise EmailSendError("RESEND_API_KEY not configured")

    payload = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        r = httpx.post(_RESEND_URL, json=payload, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        log.warning("resend network error: %s", exc)
        raise EmailSendError(f"network error: {exc}") from exc

    if r.status_code >= 300:
        log.warning("resend rejected: %s %s", r.status_code, r.text[:300])
        raise EmailSendError(f"resend {r.status_code}: {r.text[:200]}")

    data = r.json()
    return str(data.get("id", ""))


# ─── Templates ──────────────────────────────────────────────────────────────

_BRAND = "#ff9900"
_BG = "#0a0a0a"
_CARD_BG = "#141414"
_TEXT = "#ff9900"
_DIM = "#cc7700"


def _wrap(preheader: str, body_html: str) -> str:
    return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:{_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">{preheader}</span>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:40px 16px;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:{_CARD_BG};border:1px solid {_BRAND};border-radius:2px;">
          <tr><td style="padding:28px 32px;">
            <div style="color:{_BRAND};font-size:18px;font-weight:700;letter-spacing:.25em;margin-bottom:4px;">SPECTRA TERMINAL</div>
            <div style="color:{_DIM};font-size:10px;letter-spacing:.2em;margin-bottom:24px;">MARKET DATA &middot; ALL SOURCES &middot; FREE TIER</div>
            <div style="color:{_TEXT};font-size:14px;line-height:1.55;">
              {body_html}
            </div>
            <div style="color:{_DIM};font-size:10px;margin-top:28px;letter-spacing:.05em;">If you didn&rsquo;t request this, you can ignore this email.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def _button(href: str, label: str) -> str:
    return (
        f'<a href="{href}" style="display:inline-block;background:{_BRAND};color:#000;'
        'text-decoration:none;padding:10px 22px;font-weight:700;letter-spacing:.15em;'
        'font-size:12px;border-radius:2px;">' + label + "</a>"
    )


def render_verify_email(username: str, verify_url: str) -> str:
    body = f"""
      <p>Welcome, <b>{username}</b>. Confirm your email to finish setting up your Spectra Terminal account.</p>
      <p style="margin:22px 0;">{_button(verify_url, "VERIFY EMAIL")}</p>
      <p style="color:{_DIM};font-size:12px;word-break:break-all;">Or paste this link: <br/>{verify_url}</p>
      <p style="color:{_DIM};font-size:12px;">This link expires in 24 hours.</p>
    """
    return _wrap("Confirm your Spectra Terminal email", body)


def render_reset_email(username: str, reset_url: str) -> str:
    body = f"""
      <p>Hi <b>{username}</b>, we received a request to reset your Spectra Terminal password.</p>
      <p style="margin:22px 0;">{_button(reset_url, "RESET PASSWORD")}</p>
      <p style="color:{_DIM};font-size:12px;word-break:break-all;">Or paste this link: <br/>{reset_url}</p>
      <p style="color:{_DIM};font-size:12px;">This link expires in 1 hour. If you didn&rsquo;t request it, no action is needed.</p>
    """
    return _wrap("Reset your Spectra Terminal password", body)
