"""Authorization seam.

The company's user/organization model is PENDING (Decision Register D-04). All data access for
user-owned resources goes through an `AccessPolicy`, so tenant/role rules can be introduced in one
place later without touching routes or services. Today's policy is: owner only.

Unauthorized access to another user's resource must look like "not found" (no existence leak).
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core.errors import NotFound


@dataclass(frozen=True)
class Actor:
    user_id: uuid.UUID
    # Reserved for future tenant/role information. Intentionally empty: nothing is assumed.
    scope: Mapping[str, Any] = field(default_factory=dict)


class AccessPolicy(Protocol):
    def can_access_owned(self, actor: Actor, owner_id: uuid.UUID) -> bool: ...


class OwnerOnlyPolicy:
    def can_access_owned(self, actor: Actor, owner_id: uuid.UUID) -> bool:
        return actor.user_id == owner_id


_policy: AccessPolicy = OwnerOnlyPolicy()


def get_policy() -> AccessPolicy:
    return _policy


def ensure_access(actor: Actor, owner_id: uuid.UUID, policy: AccessPolicy | None = None) -> None:
    if not (policy or _policy).can_access_owned(actor, owner_id):
        raise NotFound()
