"""Provider registry + configuration resolution.

The built-in adapters are "openai" and "groq" (Decision Register D-03). If LLM_PROVIDER is
unset, names an unregistered adapter, or the adapter's model or API key is missing, AI features
report "AI provider not configured" - they never return substitute output. A fake provider may
be registered by automated tests only.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.ai.provider import LLMProvider
from app.core.config import Settings
from app.core.errors import AiProviderNotConfigured

ProviderFactory = Callable[[Settings], LLMProvider]


@dataclass(frozen=True)
class _Entry:
    factory: ProviderFactory
    requires_api_key: bool


_REGISTRY: dict[str, _Entry] = {}


def register_provider(
    name: str, factory: ProviderFactory, *, requires_api_key: bool = False
) -> None:
    _REGISTRY[name.lower()] = _Entry(factory, requires_api_key)


def unregister_provider(name: str) -> None:
    _REGISTRY.pop(name.lower(), None)


def _openai(settings: Settings) -> LLMProvider:
    from app.ai.providers import openai  # vendor code stays in app/ai/providers

    return openai.create(settings)


def _groq(settings: Settings) -> LLMProvider:
    from app.ai.providers import openai

    return openai.create_groq(settings)


register_provider("openai", _openai, requires_api_key=True)
register_provider("groq", _groq, requires_api_key=True)


@dataclass(frozen=True)
class AiStatus:
    configured: bool
    provider: str | None
    model: str | None
    reason: str | None


def ai_status(settings: Settings) -> AiStatus:
    name = (settings.llm_provider or "").lower()
    if not name:
        return AiStatus(False, None, None, "LLM_PROVIDER is not set.")
    if name not in _REGISTRY:
        reason = "No adapter is installed for this provider."
        return AiStatus(False, name, settings.llm_model, reason)
    if not settings.llm_model:
        return AiStatus(False, name, None, "LLM_MODEL is not set.")
    if _REGISTRY[name].requires_api_key and settings.llm_api_key is None:
        return AiStatus(False, name, settings.llm_model, "LLM_API_KEY is not set.")
    return AiStatus(True, name, settings.llm_model, None)


def get_llm_provider(settings: Settings) -> LLMProvider:
    status = ai_status(settings)
    if not status.configured or status.provider is None:
        raise AiProviderNotConfigured()
    return _REGISTRY[status.provider].factory(settings)
