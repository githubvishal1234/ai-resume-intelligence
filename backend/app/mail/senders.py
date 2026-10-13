"""Built-in email senders. SMTP is a generic protocol, so no vendor is chosen here (D-07)."""

from __future__ import annotations

import logging
import smtplib
import ssl
from collections.abc import Mapping
from email.message import EmailMessage
from typing import Any

from app.core.config import Settings
from app.mail.base import EmailSender, EmailSendFailed, register_email_sender
from app.mail.templates import render

logger = logging.getLogger(__name__)


def _message(sender: str, to: str, template: str, context: Mapping[str, Any]) -> EmailMessage:
    subject, body = render(template, context)
    message = EmailMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    return message


class SmtpEmailSender(EmailSender):
    name = "smtp"

    def __init__(self, settings: Settings) -> None:
        assert settings.smtp_host and settings.email_from  # checked by email_status
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.security = settings.smtp_security
        self.username = settings.smtp_username
        self.password = settings.smtp_password
        self.timeout = settings.smtp_timeout_seconds
        self.sender = settings.email_from

    def send(self, to: str, template: str, context: Mapping[str, Any]) -> None:
        message = _message(self.sender, to, template, context)
        tls = ssl.create_default_context()
        try:
            client: smtplib.SMTP
            if self.security == "ssl":
                client = smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout, context=tls)
            else:
                client = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
            with client:
                if self.security == "starttls":
                    client.starttls(context=tls)
                if self.username:
                    password = self.password.get_secret_value() if self.password else ""
                    client.login(self.username, password)
                client.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            # The error type only: server replies can echo addresses or credentials.
            logger.warning(
                "email.send_failed", extra={"template": template, "error": type(exc).__name__}
            )
            raise EmailSendFailed() from None


class ConsoleEmailSender(EmailSender):
    """Development only: writes the message to the log instead of sending it."""

    name = "console"

    def __init__(self, settings: Settings) -> None:
        if settings.is_production:
            raise RuntimeError("EMAIL_PROVIDER=console is not allowed in production.")
        assert settings.email_from
        self.sender = settings.email_from

    def send(self, to: str, template: str, context: Mapping[str, Any]) -> None:
        subject, body = render(template, context)
        # Decoded text, so links can be copied from the log as they are.
        logger.info(
            "email.console\nFrom: %s\nTo: %s\nSubject: %s\n\n%s", self.sender, to, subject, body
        )


register_email_sender("smtp", SmtpEmailSender, requires=(("smtp_host", "SMTP_HOST"),))
register_email_sender("console", ConsoleEmailSender)
