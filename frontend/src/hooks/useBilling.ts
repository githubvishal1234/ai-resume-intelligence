import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PRODUCT_NAME } from "@/constants/branding";
import { formatPrice, PRO_PRICE } from "@/constants/pricing";
import { payWithRazorpay } from "@/lib/razorpayCheckout";
import { billingService, type BillingInterval } from "@/services/billingService";
import { useSession } from "./useSession";

export const BILLING_KEY = ["billing"] as const;

export function useBilling(enabled: boolean) {
  return useQuery({ queryKey: BILLING_KEY, queryFn: billingService.get, enabled });
}

/** Create the subscription, pay in Razorpay Checkout, then have the server verify it.
 *  Resolves to "paid" or "closed" (the person closed Checkout without paying). */
export function useUpgrade() {
  const client = useQueryClient();
  const user = useSession().data?.user;
  return useMutation({
    mutationFn: async (interval: BillingInterval) => {
      const checkout = await billingService.checkout(interval);
      const result = await payWithRazorpay(checkout, {
        productName: PRODUCT_NAME,
        description: `Pro, ${formatPrice(PRO_PRICE[interval])} ${interval === "monthly" ? "a month" : "a year"}`,
        name: user?.display_name,
        email: user?.email,
      });
      if (!result) return "closed" as const;
      client.setQueryData(BILLING_KEY, await billingService.verify(result));
      void client.invalidateQueries({ queryKey: ["ai", "usage"] });
      return "paid" as const;
    },
  });
}

export function useCancelPro() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: billingService.cancel,
    onSuccess: (state) => client.setQueryData(BILLING_KEY, state),
  });
}
