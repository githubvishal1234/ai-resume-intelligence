/**
 * Razorpay Checkout. Its script is loaded only when someone starts an upgrade, so no page
 * contacts Razorpay before that. The CSP allows exactly this script and Razorpay's frame.
 */
import type { Checkout, PaymentResult } from "@/services/billingService";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string };
  theme: { color: string };
  handler: (result: PaymentResult) => void;
  modal: { ondismiss: () => void };
};
type RazorpayCtor = new (options: RazorpayOptions) => { open: () => void };

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

let loading: Promise<RazorpayCtor> | null = null;

function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Checkout did not load.")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't reach the payment page. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens Checkout. Resolves with Razorpay's result, or null when the person closes it. */
export async function payWithRazorpay(
  checkout: Checkout,
  details: { productName: string; description: string; name?: string; email?: string },
): Promise<PaymentResult | null> {
  const Razorpay = await loadCheckout();
  return new Promise((resolve) => {
    new Razorpay({
      key: checkout.key_id,
      subscription_id: checkout.subscription_id,
      name: details.productName,
      description: details.description,
      prefill: { name: details.name, email: details.email },
      theme: { color: "#047857" },
      handler: (result) => resolve(result),
      modal: { ondismiss: () => resolve(null) },
    }).open();
  });
}
