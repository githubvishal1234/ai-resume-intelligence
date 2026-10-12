"""Email abstraction. No provider is selected (Decision Register D-07).

Core workflows do not depend on email. Features that need it (verification, password reset,
mailed notifications) are not implemented in Phase 1 and must stay disabled until a sender is
configured.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.core.errors import ServiceUnavailable


class EmailNotConfigured(ServiceUnavailable):
    code = "EMAIL_NOT_CONFIGURED"
    message = "Email delivery is not configured."


class EmailSender(ABC):
    name: str

    @abstractmethod
    def send(self, to: str, template: str, context: Mapping[str, Any]) -> None: ...


_REGISTRY: dict[str, Callable[[Settings], EmailSender]] = {}


def register_email_sender(name: str, factory: Callable[[Settings], EmailSender]) -> None:
    _REGISTRY[name.lower()] = factory


@dataclass(frozen=True)
class EmailStatus:
    configured: bool
    provider: str | None


def email_status(settings: Settings) -> EmailStatus:
    name = (settings.email_provider or "").lower()
    return EmailStatus(bool(name) and name in _REGISTRY, name or None)


def get_email_sender(settings: Settings) -> EmailSender:
    status = email_status(settings)
    if not status.configured or status.provider is None:
        raise EmailNotConfigured()
    return _REGISTRY[status.provider](settings)
