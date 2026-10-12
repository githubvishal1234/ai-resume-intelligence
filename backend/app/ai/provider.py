"""LLM provider abstraction.

No vendor is selected (Decision Register D-03). Nothing outside `app/ai/providers/<name>.py`
may import a vendor SDK. Concrete adapters are added only once the company names its provider.

Contract notes for future adapters:
- Return data validated against the caller's Pydantic schema; raise `LLMOutputInvalid` otherwise.
- Resume / job-description text is DATA: callers pass it in `LLMMessage(role="user")` content
  fields, never concatenated into the system prompt.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class LLMMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass(frozen=True)
class LLMUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True)
class LLMCapabilities:
    structured_output: bool
    max_context_tokens: int | None = None


@dataclass(frozen=True)
class StructuredResult[T: BaseModel]:
    parsed: T
    usage: LLMUsage
    provider: str
    model: str
    latency_ms: float


class LLMOutputInvalid(Exception):
    """Provider output failed schema validation. Callers retry (bounded) or fail safely."""


class LLMProvider(ABC):
    name: str

    @property
    @abstractmethod
    def model(self) -> str: ...

    @property
    @abstractmethod
    def capabilities(self) -> LLMCapabilities: ...

    @abstractmethod
    def generate_structured(
        self, schema: type[T], messages: list[LLMMessage], *, max_output_tokens: int | None = None
    ) -> StructuredResult[T]: ...
