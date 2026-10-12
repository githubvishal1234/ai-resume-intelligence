"""Job-source ingestion boundary.

Supported today (Phase 3, not yet implemented): pasted job description and uploaded JD file.
External sources (LinkedIn / Naukri / Indeed / career pages) are NOT implemented and must not be
added without explicit company approval (Decision Register D-05). An approved source is added as
one `JobSourceAdapter` + a registry entry; the analysis pipeline only consumes `RawJobContent`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class RawJobContent:
    source_id: str
    text: str
    source_url: str | None = None


class JobExtractionFailed(Exception):
    """Raised instead of ever fabricating job data. UI: 'Unable to extract this job posting.
    Paste the job description instead.'"""


class JobSourceAdapter(ABC):
    source_id: str
    compliance_note: str  # who approved this source, and on what basis

    @abstractmethod
    def matches(self, url: str) -> bool: ...

    @abstractmethod
    def fetch(self, url: str) -> RawJobContent: ...


_ADAPTERS: list[JobSourceAdapter] = []  # intentionally empty


def registered_adapters() -> list[JobSourceAdapter]:
    return list(_ADAPTERS)
