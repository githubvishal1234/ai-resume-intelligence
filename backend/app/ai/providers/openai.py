"""OpenAI adapter (Decision Register D-03: OpenAI, chosen 2026-10-12).

Calls the Chat Completions API with a JSON-schema response format, then validates the answer
against the caller's Pydantic schema. It uses only the standard library, so no vendor SDK is
installed. `LLM_BASE_URL` may point at any OpenAI-compatible endpoint; it defaults to OpenAI.

Nothing here logs or raises with the API key, the prompt or the response text.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from email.message import Message
from typing import Any

from pydantic import BaseModel, ValidationError

from app.ai.provider import (
    LLMCapabilities,
    LLMMessage,
    LLMOutputInvalid,
    LLMProvider,
    LLMUsage,
    StructuredResult,
)
from app.core.config import Settings
from app.core.errors import AiProviderFailed, AiProviderNotConfigured

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.openai.com/v1"
_RETRY_STATUSES = {408, 409, 429, 500, 502, 503, 504}
_MAX_BACKOFF_SECONDS = 10.0


def _schema_name(schema: type[BaseModel]) -> str:
    name = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in schema.__name__)
    return name[:64] or "result"


def _retry_after(headers: Message | None, attempt: int) -> float:
    value = headers.get("retry-after") if headers is not None else None
    try:
        seconds = float(value) if value is not None else 2.0**attempt
    except ValueError:
        seconds = 2.0**attempt
    return min(max(seconds, 0.0), _MAX_BACKOFF_SECONDS)


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        if settings.llm_api_key is None or not settings.llm_model:
            raise AiProviderNotConfigured()
        self._model = settings.llm_model
        self._key = settings.llm_api_key.get_secret_value()
        self._url = (settings.llm_base_url or DEFAULT_BASE_URL).rstrip("/") + "/chat/completions"
        self._timeout = settings.llm_timeout_seconds
        self._retries = settings.llm_max_retries

    @property
    def model(self) -> str:
        return self._model

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured[T: BaseModel](
        self, schema: type[T], messages: list[LLMMessage], *, max_output_tokens: int | None = None
    ) -> StructuredResult[T]:
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": _schema_name(schema),
                    "schema": schema.model_json_schema(),
                    # Strict mode rejects optional fields; the answer is validated below instead.
                    "strict": False,
                },
            },
        }
        if max_output_tokens is not None:
            body["max_completion_tokens"] = max_output_tokens

        started = time.monotonic()
        data = self._post(body)
        latency_ms = (time.monotonic() - started) * 1000

        try:
            choice = data["choices"][0]
            message = choice["message"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMOutputInvalid() from exc
        if message.get("refusal"):
            raise LLMOutputInvalid("The AI provider declined to answer this request.")
        if choice.get("finish_reason") == "length":
            raise LLMOutputInvalid(
                "The AI answer was cut off before it finished. Please try again."
            )
        try:
            parsed = schema.model_validate_json(message.get("content") or "")
        except ValidationError as exc:
            raise LLMOutputInvalid() from exc

        usage = data.get("usage") or {}
        return StructuredResult(
            parsed=parsed,
            usage=LLMUsage(
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
            ),
            provider=self.name,
            model=str(data.get("model") or self._model),
            latency_ms=latency_ms,
        )

    def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        payload = json.dumps(body).encode()
        for attempt in range(self._retries + 1):
            request = urllib.request.Request(  # noqa: S310 - URL comes from server config
                self._url,
                data=payload,
                method="POST",
                headers={
                    "Authorization": f"Bearer {self._key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            retry_in: float | None = None
            try:
                with urllib.request.urlopen(request, timeout=self._timeout) as resp:  # noqa: S310
                    result = json.loads(resp.read())
                    if not isinstance(result, dict):
                        raise LLMOutputInvalid()
                    return result
            except urllib.error.HTTPError as exc:
                exc.close()
                logger.warning("llm_http_error", extra={"status": exc.code, "attempt": attempt})
                if exc.code in (401, 403):
                    raise AiProviderFailed(
                        "The AI provider rejected the API key. An administrator must check it."
                    ) from None
                if exc.code not in _RETRY_STATUSES:
                    raise AiProviderFailed() from None
                retry_in = _retry_after(exc.headers, attempt)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                logger.warning(
                    "llm_transport_error", extra={"error": type(exc).__name__, "attempt": attempt}
                )
                retry_in = _retry_after(None, attempt)
            except json.JSONDecodeError:
                raise LLMOutputInvalid() from None
            if attempt < self._retries:
                time.sleep(retry_in)
        raise AiProviderFailed()


def create(settings: Settings) -> LLMProvider:
    return OpenAIProvider(settings)
