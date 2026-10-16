import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ApiErrorText } from "@/components/ui/ApiErrorText";
import { ApiError } from "@/services/apiClient";
import { mockApi, renderApp, SESSION } from "@/test/utils";

const me = { path: "/auth/me", body: SESSION };
const FREE = { configured: true, plan: "free", ai_daily_limit: 5, subscription: null };
const PRO = {
  configured: true,
  plan: "pro",
  ai_daily_limit: 100,
  subscription: { interval: "monthly", status: "active", current_end: "2026-11-16T00:00:00Z", cancel_at_period_end: false },
};
const PAID = { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "sig" };

/** Stands in for Razorpay Checkout: records the options and either pays or is closed. */
function fakeCheckout(outcome: "pay" | "close") {
  const opened: Record<string, unknown>[] = [];
  window.Razorpay = class {
    constructor(private options: { handler: (r: typeof PAID) => void; modal: { ondismiss: () => void } } & Record<string, unknown>) {
      opened.push(options);
    }
    open() {
      if (outcome === "pay") this.options.handler(PAID);
      else this.options.modal.ondismiss();
    }
  } as unknown as typeof window.Razorpay;
  return opened;
}

const proCard = () => screen.getByRole("article", { name: "Pro" }) as HTMLElement;

afterEach(() => {
  delete window.Razorpay;
});

describe("Pro billing", () => {
  it("upgrades through Razorpay Checkout and confirms with the server", async () => {
    const user = userEvent.setup();
    const opened = fakeCheckout("pay");
    const { calls } = mockApi([
      me,
      { path: "/billing", body: FREE },
      { method: "POST", path: "/billing/checkout", body: { key_id: "rzp_test_key", subscription_id: "sub_1", interval: "yearly" } },
      { method: "POST", path: "/billing/verify", body: { ...PRO, subscription: { ...PRO.subscription, interval: "yearly" } } },
    ]);
    renderApp("/pricing");
    await user.click(await screen.findByRole("radio", { name: "Yearly · save 30%" }));
    await user.click(await within(proCard()).findByRole("button", { name: "Upgrade to Pro · ₹2,499 a year" }));

    expect(await within(proCard()).findByText("You're on Pro")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/billing/checkout")?.body).toEqual({ interval: "yearly" });
    const verify = calls.find((c) => c.path === "/billing/verify");
    expect(verify?.body).toEqual(PAID);
    expect(verify?.headers["X-CSRF-Token"]).toBe("csrf-abc");
    expect(opened[0]).toMatchObject({ key: "rzp_test_key", subscription_id: "sub_1", prefill: { email: SESSION.user.email } });
  });

  it("does nothing when Checkout is closed without paying", async () => {
    const user = userEvent.setup();
    fakeCheckout("close");
    const { calls } = mockApi([
      me,
      { path: "/billing", body: FREE },
      { method: "POST", path: "/billing/checkout", body: { key_id: "rzp_test_key", subscription_id: "sub_1", interval: "monthly" } },
    ]);
    renderApp("/pricing");
    await screen.findByRole("article", { name: "Pro" });
    const button = await within(proCard()).findByRole("button", { name: "Upgrade to Pro · ₹299 a month" });
    await user.click(button);
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(calls.some((c) => c.path === "/billing/verify")).toBe(false);
    expect(within(proCard()).queryByText("You're on Pro")).not.toBeInTheDocument();
  });

  it("keeps the waitlist when payments are not set up", async () => {
    mockApi([
      me,
      { path: "/billing", body: { configured: false, plan: "free", ai_daily_limit: 100, subscription: null } },
      { path: "/account/pro-waitlist", body: { joined: false, joined_at: null } },
    ]);
    renderApp("/pricing");
    await screen.findByRole("article", { name: "Pro" });
    expect(await within(proCard()).findByRole("button", { name: "Join the Pro waitlist" })).toBeInTheDocument();
    expect(within(proCard()).queryByRole("button", { name: /Upgrade to Pro/ })).not.toBeInTheDocument();
  });

  it("shows the plan in Settings and cancels at the end of the period", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi([
      me,
      { path: "/account/sign-ins", body: [] },
      { path: "/billing", body: PRO },
      { method: "POST", path: "/billing/cancel", body: { ...PRO, subscription: { ...PRO.subscription, cancel_at_period_end: true } } },
    ]);
    renderApp("/settings");
    const card = (await screen.findByRole("region", { name: "Plan" })) as HTMLElement;
    expect(within(card).getByText(/Renews on/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Cancel Pro" }));
    await user.click(within(card).getByRole("button", { name: "Cancel Pro" }));
    expect(await within(card).findByText(/Cancelled: Pro stays on until/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/billing/cancel")).toHaveLength(1);
  });

  it("links to Pro when the free AI allowance is used up", () => {
    const error = new ApiError(402, "PLAN_UPGRADE_REQUIRED", "You have used today's free AI requests.", null, []);
    render(<MemoryRouter><p><ApiErrorText error={error} /></p></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
  });
});
