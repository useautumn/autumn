import type { BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";
import { billingContextToNewSubscriptionAnchorMs } from "@/internal/billing/v2/utils/billingContext/billingContextToNewSubscriptionAnchorMs";

type StripeNewSubscriptionAnchorParams = {
	billing_cycle_anchor: number;
	proration_behavior: "create_prorations" | "none";
};

/**
 * Stripe prorates the stub up to the anchor, or with "none" bills nothing until it.
 * A backdate recreate never prorates: the replaced subscription already paid up to the anchor.
 */
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
			billingContext.requestedProrationBehavior === "none" ||
			isBackdateRecreate({ billingContext })
				? "none"
				: "create_prorations",
	};
};
