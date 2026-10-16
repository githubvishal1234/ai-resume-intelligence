"""Create the two Pro plans in the Razorpay account and print their ids for `.env`.

Run once per Razorpay mode (test, then live) from backend/:
    python -m app.billing.create_plans
Needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Razorpay plans can't be edited, so running it
again makes new plans; to change a price, create new plans and update `.env`.
"""

from __future__ import annotations

from app.billing.razorpay import RazorpayClient
from app.billing.service import PRICE_PAISE
from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    client = RazorpayClient(settings)
    mode = "test" if (settings.razorpay_key_id or "").startswith("rzp_test_") else "live"
    for interval, env in (("monthly", "RAZORPAY_PLAN_MONTHLY"), ("yearly", "RAZORPAY_PLAN_YEARLY")):
        plan = client.create_plan(
            period=interval, amount_paise=PRICE_PAISE[interval], name=f"Pro ({interval})"
        )
        print(f"{env}={plan['id']}")
    print(f"# Created in Razorpay {mode} mode. Add the lines above to backend/.env.")


if __name__ == "__main__":
    main()
