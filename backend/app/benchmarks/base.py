"""Benchmark / market-data boundary. No data source is approved (Decision Register D-09).

No percentiles, market-demand figures or "calibrated against N postings" claims may be produced
without a provider that returns real data with provenance. The default provider reports
"unavailable" and the UI hides the related panels.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Provenance:
    source_name: str
    as_of: date
    sample_size: int
    license: str


@dataclass(frozen=True)
class BenchmarkValue:
    value: float
    provenance: Provenance


class BenchmarkProvider(ABC):
    available: bool

    @abstractmethod
    def percentile(self, metric: str, value: float, segment: str) -> BenchmarkValue | None: ...

    @abstractmethod
    def skill_demand(self, skill: str, segment: str) -> BenchmarkValue | None: ...


class NullBenchmarkProvider(BenchmarkProvider):
    available = False

    def percentile(self, metric: str, value: float, segment: str) -> BenchmarkValue | None:
        return None

    def skill_demand(self, skill: str, segment: str) -> BenchmarkValue | None:
        return None


def get_benchmark_provider() -> BenchmarkProvider:
    return NullBenchmarkProvider()
