"""Plain-text email templates. Context values are inserted as text, never as markup."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from app.core.branding import PRODUCT_NAME


def render(template: str, context: Mapping[str, Any]) -> tuple[str, str]:
    if template == "password_reset":
        minutes = int(context["ttl_minutes"])
        return (
            f"Reset your {PRODUCT_NAME} password",
            f"Hello {context['display_name']},\n\n"
            f"Someone asked to reset the password for your {PRODUCT_NAME} account. "
            f"To choose a new password, open this link within {minutes} minutes:\n\n"
            f"{context['link']}\n\n"
            "The link works once. If you didn't ask for this, you can ignore this email: "
            "your password has not changed.\n",
        )
    raise KeyError(f"Unknown email template '{template}'.")
