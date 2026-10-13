"""OpenAI adapter, exercised against a local stand-in for the Chat Completions API."""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, SecretStr

from app.ai.provider import LLMMessage, LLMOutputInvalid
from app.ai.registry import ai_status, get_llm_provider
from app.core.config import Settings, get_settings
from app.core.errors import AiProviderFailed
from tests.test_interview import API, _prep, _start

KEY = "sk-test-SECRET-KEY"


class Answer(BaseModel):
    score: int
    notes: list[str] = []


class FakeOpenAI:
    """Replies with queued (status, body, headers) tuples and records each request."""

    def __init__(self) -> None:
        self.replies: list[tuple[int, Any, dict[str, str]]] = []
        self.requests: list[dict[str, Any]] = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - http.server API
                length = int(self.headers["Content-Length"])
                fake.requests.append(
                    {
                        "path": self.path,
                        "auth": self.headers.get("Authorization"),
                        "body": json.loads(self.rfile.read(length)),
                    }
                )
                status, body, headers = fake.replies.pop(0)
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                for k, v in headers.items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args: object) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}/v1"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def ok(self, content: str, **message: Any) -> None:
        self.replies.append(
            (
                200,
                {
                    "model": "gpt-test-2026",
                    "choices": [
                        {
                            "finish_reason": "stop",
                            "message": {"role": "assistant", "content": content, **message},
                        }
                    ],
                    "usage": {"prompt_tokens": 120, "completion_tokens": 30},
                },
                {},
            )
        )


@pytest.fixture
def openai_server(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeOpenAI]:
    for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        monkeypatch.delenv(var, raising=False)
    fake = FakeOpenAI()
    yield fake
    fake.server.shutdown()


@pytest.fixture
def openai_settings(settings: Settings, openai_server: FakeOpenAI) -> Settings:
    return settings.model_copy(
        update={
            "llm_provider": "openai",
            "llm_model": "gpt-test",
            "llm_base_url": openai_server.url,
            "llm_api_key": SecretStr(KEY),
            "llm_timeout_seconds": 5,
            "llm_max_retries": 1,
        }
    )


MESSAGES = [
    LLMMessage(role="system", content="Rate the answer."),
    LLMMessage(role="user", content="ANSWER:\nI shipped it."),
]


def test_status_needs_model_and_key(settings: Settings) -> None:
    s = settings.model_copy(update={"llm_provider": "openai", "llm_model": "gpt-test"})
    status = ai_status(s)
    assert not status.configured and status.reason == "LLM_API_KEY is not set."
    s = s.model_copy(update={"llm_api_key": SecretStr(KEY)})
    assert ai_status(s).configured
    assert Settings(llm_api_key="  ").llm_api_key is None  # type: ignore[arg-type]


def test_structured_request_and_parsed_result(
    openai_settings: Settings, openai_server: FakeOpenAI
) -> None:
    openai_server.ok('{"score": 4, "notes": ["Specific."]}')
    result = get_llm_provider(openai_settings).generate_structured(
        Answer, MESSAGES, max_output_tokens=200
    )
    assert result.parsed == Answer(score=4, notes=["Specific."])
    assert (result.provider, result.model) == ("openai", "gpt-test-2026")
    assert (result.usage.input_tokens, result.usage.output_tokens) == (120, 30)

    sent = openai_server.requests[0]
    assert sent["path"] == "/v1/chat/completions"
    assert sent["auth"] == f"Bearer {KEY}"
    body = sent["body"]
    assert body["model"] == "gpt-test"
    assert body["max_completion_tokens"] == 200
    assert body["messages"] == [
        {"role": "system", "content": "Rate the answer."},
        {"role": "user", "content": "ANSWER:\nI shipped it."},
    ]
    fmt = body["response_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["name"] == "Answer"
    assert fmt["json_schema"]["schema"]["properties"]["score"]["type"] == "integer"


@pytest.mark.parametrize(
    ("content", "extra"),
    [
        ("not json", {}),
        ('{"notes": []}', {}),  # missing required field
        (None, {"refusal": "I can't help with that."}),
    ],
)
def test_unusable_answers_are_rejected(
    openai_settings: Settings, openai_server: FakeOpenAI, content: str | None, extra: Any
) -> None:
    openai_server.ok(content, **extra)  # type: ignore[arg-type]
    with pytest.raises(LLMOutputInvalid):
        get_llm_provider(openai_settings).generate_structured(Answer, MESSAGES)


def test_rate_limit_is_retried(openai_settings: Settings, openai_server: FakeOpenAI) -> None:
    openai_server.replies.append((429, {"error": {"message": "slow down"}}, {"Retry-After": "0"}))
    openai_server.ok('{"score": 2}')
    result = get_llm_provider(openai_settings).generate_structured(Answer, MESSAGES)
    assert result.parsed.score == 2
    assert len(openai_server.requests) == 2


def test_retries_are_bounded(openai_settings: Settings, openai_server: FakeOpenAI) -> None:
    for _ in range(2):
        openai_server.replies.append((503, {"error": {}}, {"Retry-After": "0"}))
    with pytest.raises(AiProviderFailed) as exc:
        get_llm_provider(openai_settings).generate_structured(Answer, MESSAGES)
    assert exc.value.code == "AI_PROVIDER_FAILED"
    assert len(openai_server.requests) == 2


def test_bad_key_is_not_retried_or_leaked(
    openai_settings: Settings, openai_server: FakeOpenAI
) -> None:
    openai_server.replies.append((401, {"error": {"message": f"bad key {KEY}"}}, {}))
    with pytest.raises(AiProviderFailed) as exc:
        get_llm_provider(openai_settings).generate_structured(Answer, MESSAGES)
    assert "API key" in exc.value.message and KEY not in str(exc.value)
    assert len(openai_server.requests) == 1


@pytest.fixture
def openai_app(app: FastAPI, openai_settings: Settings) -> FastAPI:
    app.dependency_overrides[get_settings] = lambda: openai_settings
    return app


def test_interview_feedback_through_openai(
    openai_app: FastAPI, user_client: TestClient, openai_server: FakeOpenAI
) -> None:
    prep = _prep(user_client)
    session = _start(user_client, prep)
    qid = session["questions"][0]["id"]
    url = f"{API}/sessions/{session['id']}/answers/{qid}"
    user_client.put(url, json={"answer": "SECRET-ANSWER about pipelines."})

    openai_server.ok('{"score": 4, "strengths": ["Concrete."], "improvements": []}')
    response = user_client.post(f"{url}/evaluate")
    assert response.status_code == 200, response.text
    feedback = response.json()["answers"][0]["feedback"]
    assert feedback["score"] == 4 and feedback["source"] == "openai (gpt-test-2026)"
    messages = openai_server.requests[0]["body"]["messages"]
    assert "SECRET-ANSWER" not in messages[0]["content"] and messages[0]["role"] == "system"

    openai_server.ok("{}")
    failed = user_client.post(f"{url}/evaluate")
    assert failed.status_code == 502
    assert failed.json()["code"] == "AI_OUTPUT_INVALID"
    assert (
        user_client.get(f"{API}/sessions/{session['id']}").json()["answers"][0]["feedback"]["score"]
        == 4
    )


# ---- Groq (same API format) ------------------------------------------------------------
def test_groq_defaults_to_groq_and_needs_a_key(settings: Settings) -> None:
    s = settings.model_copy(update={"llm_provider": "groq", "llm_model": "openai/gpt-oss-120b"})
    assert ai_status(s).reason == "LLM_API_KEY is not set."
    s = s.model_copy(update={"llm_api_key": SecretStr(KEY)})
    assert ai_status(s).configured
    provider = get_llm_provider(s)
    assert provider.name == "groq"
    assert provider._url == "https://api.groq.com/openai/v1/chat/completions"  # type: ignore[attr-defined]


def test_groq_raises_small_output_limits_for_reasoning_models(
    openai_settings: Settings, openai_server: FakeOpenAI
) -> None:
    s = openai_settings.model_copy(update={"llm_provider": "groq"})
    openai_server.ok('{"score": 5}')
    result = get_llm_provider(s).generate_structured(Answer, MESSAGES, max_output_tokens=200)
    assert result.provider == "groq" and result.parsed.score == 5
    assert openai_server.requests[0]["body"]["max_completion_tokens"] == 1024
    assert openai_server.requests[0]["body"]["response_format"]["type"] == "json_schema"


def test_json_object_mode_puts_the_schema_in_a_system_message(
    openai_settings: Settings, openai_server: FakeOpenAI
) -> None:
    s = openai_settings.model_copy(
        update={"llm_provider": "groq", "llm_response_format": "json_object"}
    )
    openai_server.ok('{"score": 3, "notes": []}')
    result = get_llm_provider(s).generate_structured(Answer, MESSAGES)
    assert result.parsed.score == 3
    body = openai_server.requests[0]["body"]
    assert body["response_format"] == {"type": "json_object"}
    first = body["messages"][0]
    assert first["role"] == "system" and "JSON" in first["content"]
    assert '"score"' in first["content"]
    assert body["messages"][1:] == [
        {"role": "system", "content": "Rate the answer."},
        {"role": "user", "content": "ANSWER:\nI shipped it."},
    ]
    # Valid JSON that does not match the schema is still refused.
    openai_server.ok('{"notes": ["no score"]}')
    with pytest.raises(LLMOutputInvalid):
        get_llm_provider(s).generate_structured(Answer, MESSAGES)
