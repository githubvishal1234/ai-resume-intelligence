import type { components } from "@/types/api";
import { api } from "./apiClient";

export type Billing = components["schemas"]["BillingOut"];
export type Checkout = components["schemas"]["CheckoutOut"];
export type BillingInterval = components["schemas"]["CheckoutIn"]["interval"];
export type PaymentResult = components["schemas"]["VerifyIn"];

export const billingService = {
  get: () => api.get<Billing>("/billing"),
  checkout: (interval: BillingInterval) => api.post<Checkout>("/billing/checkout", { interval }),
  verify: (result: PaymentResult) => api.post<Billing>("/billing/verify", result),
  cancel: () => api.post<Billing>("/billing/cancel"),
};
