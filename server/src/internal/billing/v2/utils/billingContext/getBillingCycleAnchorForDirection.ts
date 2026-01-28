import type { BillingContext } from "@/internal/billing/v2/types";
import { getCurrentBillingCycleAnchorMs } from "@/internal/billing/v2/utils/billingContext/getCurrentBillingCycleAnchorMs";

/**
 * Returns the billing cycle anchor to use for a particular direction.
 * - "charge": uses the (possibly updated) billingCycleAnchorMs from the context
 * - "refund": uses the original billing cycle anchor before update
 */
export const getBillingCycleAnchorForDirection = ({
	billingContext,
	direction,
}: {
	billingContext: BillingContext;
	direction: "charge" | "refund";
}) => {
	const originalBillingCycleAnchorMs = getCurrentBillingCycleAnchorMs({
		billingContext,
	});

	const anchorMs =
		direction === "refund"
			? originalBillingCycleAnchorMs
			: billingContext.billingCycleAnchorMs;

	return anchorMs;
};
