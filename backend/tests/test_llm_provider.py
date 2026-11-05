from __future__ import annotations

import io
import json
import urllib.error
from email.message import Message
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel, SecretStr

from app.ai.provider import LLMMessage
from app.ai.providers import openai
from app.core.errors import AiProviderFailed


class _Answer(BaseModel):
    text: str


class _Reply:
    def __enter__(self) -> _Reply:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        content = json.dumps({"text": "ok"})
        return json.dumps({"choices": [{"message": {"content": content}}]}).encode()


def _provider() -> openai.GroqProvider:
    settings = SimpleNamespace(
        llm_api_key=SecretStr("key"),
        llm_model="model",
        llm_base_url=None,
        llm_timeout_seconds=1,
        llm_max_retries=2,
        llm_response_format="json_schema",
        llm_min_output_tokens=0,
        llm_reasoning_effort=None,
    )
    return openai.GroqProvider(settings)  # type: ignore[arg-type]


def _rejected(code: str) -> urllib.error.HTTPError:
    body = json.dumps({"error": {"code": code, "failed_generation": "resume text"}}).encode()
    return urllib.error.HTTPError("url", 400, "Bad Request", Message(), io.BytesIO(body))


def _answers(monkeypatch: pytest.MonkeyPatch, *steps: Any) -> list[Any]:
    calls: list[Any] = []

    def urlopen(request: Any, timeout: float) -> Any:
        step = steps[len(calls)]
        calls.append(request)
        if isinstance(step, Exception):
            raise step
        return step

    monkeypatch.setattr(openai.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(openai.time, "sleep", lambda _: None)
    return calls


def test_an_answer_that_missed_the_schema_is_asked_for_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _answers(monkeypatch, _rejected("json_validate_failed"), _Reply())
    question = [LLMMessage(role="user", content="hi")]
    assert _provider().generate_structured(_Answer, question).parsed.text == "ok"
    assert len(calls) == 2


def test_other_rejections_are_not_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _answers(monkeypatch, _rejected("invalid_request_error"), _Reply())
    with pytest.raises(AiProviderFailed):
        _provider().generate_structured(_Answer, [LLMMessage(role="user", content="hi")])
    assert len(calls) == 1
