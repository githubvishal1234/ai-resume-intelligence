"""OpenAI-compatible adapters: OpenAI (D-03, chosen 2026-10-12) and Groq (chosen 2026-10-13).

Calls the Chat Completions API, then validates the answer against the caller's Pydantic schema.
It uses only the standard library, so no vendor SDK is installed. `LLM_BASE_URL` may point at
any OpenAI-compatible endpoint; it defaults to the provider's own.

`LLM_RESPONSE_FORMAT` picks how structure is requested:
- `json_schema` (default): the schema is sent as the response format.
- `json_object`: for models without schema support; the schema goes in a system message and
  only valid JSON is enforced, so the answer is still validated here.

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


def _json_instructions(schema: type[BaseModel]) -> str:
    return (
        "Respond with a single JSON object and nothing else. It must match this JSON schema:\n"
        + json.dumps(schema.model_json_schema(), separators=(",", ":"))
    )


class OpenAIProvider(LLMProvider):
    name = "openai"
    default_base_url = DEFAULT_BASE_URL
    # Reasoning models count their reasoning against the output limit, so callers' small
    # limits are raised to at least this.
    min_output_tokens = 0

    def __init__(self, settings: Settings) -> None:
        if settings.llm_api_key is None or not settings.llm_model:
            raise AiProviderNotConfigured()
        self._model = settings.llm_model
        self._key = settings.llm_api_key.get_secret_value()
        base = settings.llm_base_url or self.default_base_url
        self._url = base.rstrip("/") + "/chat/completions"
        self._timeout = settings.llm_timeout_seconds
        self._retries = settings.llm_max_retries
        self._format = settings.llm_response_format
        self._min_tokens = max(self.min_output_tokens, settings.llm_min_output_tokens)

    @property
    def model(self) -> str:
        return self._model

    @property
    def capabilities(self) -> LLMCapabilities:
        return LLMCapabilities(structured_output=True)

    def generate_structured[T: BaseModel](
        self, schema: type[T], messages: list[LLMMessage], *, max_output_tokens: int | None = None
    ) -> StructuredResult[T]:
        sent = [{"role": m.role, "content": m.content} for m in messages]
        response_format: dict[str, Any]
        if self._format == "json_object":
            sent.insert(0, {"role": "system", "content": _json_instructions(schema)})
            response_format = {"type": "json_object"}
        else:
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": _schema_name(schema),
                    "schema": schema.model_json_schema(),
                    # Strict mode rejects optional fields; the answer is validated below instead.
                    "strict": False,
                },
            }
        body: dict[str, Any] = {
            "model": self._model,
            "messages": sent,
            "response_format": response_format,
        }
        if max_output_tokens is not None:
            body["max_completion_tokens"] = max(max_output_tokens, self._min_tokens)

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


class GroqProvider(OpenAIProvider):
    """Groq's OpenAI-compatible API. Schema output works on e.g. openai/gpt-oss-120b; use
    LLM_RESPONSE_FORMAT=json_object for models without it."""

    name = "groq"
    default_base_url = "https://api.groq.com/openai/v1"
    min_output_tokens = 1024  # gpt-oss models reason before answering


def create(settings: Settings) -> LLMProvider:
    return OpenAIProvider(settings)


def create_groq(settings: Settings) -> LLMProvider:
    return GroqProvider(settings)
