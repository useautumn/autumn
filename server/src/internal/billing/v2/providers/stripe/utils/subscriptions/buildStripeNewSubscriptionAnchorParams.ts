import type { BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import { billingContextToNewSubscriptionAnchorMs } from "@/internal/billing/v2/utils/billingContext/billingContextToNewSubscriptionAnchorMs";

type StripeNewSubscriptionAnchorParams = {
	billing_cycle_anchor: number;
	proration_behavior: "create_prorations" | "none";
};

/** Stripe prorates the stub up to the anchor, or with "none" bills nothing until it. */
export const buildStripeNewSubscriptionAnchorParams = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): StripeNewSubscriptionAnchorParams | undefined => {
	const anchorMs = billingContextToNewSubscriptionAnchorMs({ billingContext });
	if (anchorMs === undefined) return undefined;

	return {
		billing_cycle_anchor: msToSeconds(anchorMs),
		proration_behavior:
			billingContext.requestedProrationBehavior === "none"
				? "none"
				: "create_prorations",
	};
};
