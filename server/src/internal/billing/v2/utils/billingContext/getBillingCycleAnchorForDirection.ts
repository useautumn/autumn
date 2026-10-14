import type { BillingContext } from "@autumn/shared";
import { getCurrentBillingCycleAnchorMs } from "@/internal/billing/v2/utils/billingContext/getCurrentBillingCycleAnchorMs";

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
