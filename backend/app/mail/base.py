"""Email abstraction. No provider is selected (Decision Register D-07).

Core workflows do not depend on email. Features that need it (password reset) stay hidden
until a sender is configured. `smtp` works with any provider that offers SMTP; `console`
prints mail to the log for local development and is refused in production.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.errors import AppError, ServiceUnavailable


class EmailNotConfigured(ServiceUnavailable):
    code = "EMAIL_NOT_CONFIGURED"
    message = "Email delivery is not configured."


class EmailSendFailed(AppError):
    status_code = 502
    code = "EMAIL_SEND_FAILED"
    message = "The email could not be sent."


class EmailSender(ABC):
    name: str

    @abstractmethod
    def send(self, to: str, template: str, context: Mapping[str, Any]) -> None: ...


_REGISTRY: dict[str, Callable[[Settings], EmailSender]] = {}
# Settings each sender needs, as (attribute, ENV_NAME).
_REQUIRES: dict[str, tuple[tuple[str, str], ...]] = {}
_COMMON = (("email_from", "EMAIL_FROM"), ("app_base_url", "APP_BASE_URL"))


def register_email_sender(
    name: str,
    factory: Callable[[Settings], EmailSender],
    requires: tuple[tuple[str, str], ...] = (),
) -> None:
    _REGISTRY[name.lower()] = factory
    _REQUIRES[name.lower()] = requires


@dataclass(frozen=True)
class EmailStatus:
    configured: bool
    provider: str | None
    reason: str | None = None


def email_status(settings: Settings) -> EmailStatus:
    _load_builtin_senders()
    name = (settings.email_provider or "").lower()
    if not name:
        return EmailStatus(False, None, "EMAIL_PROVIDER is not set.")
    if name not in _REGISTRY:
        return EmailStatus(False, name, f"EMAIL_PROVIDER '{name}' is not supported.")
    missing = [env for attr, env in (*_COMMON, *_REQUIRES[name]) if not getattr(settings, attr)]
    if missing:
        return EmailStatus(False, name, f"{', '.join(missing)} must be set.")
    return EmailStatus(True, name)


def _load_builtin_senders() -> None:
    from app.mail import senders  # noqa: F401  registers smtp and console


def get_email_sender(settings: Settings) -> EmailSender:
    status = email_status(settings)
    if not status.configured or status.provider is None:
        raise EmailNotConfigured()
    return _REGISTRY[status.provider](settings)
