import { UpdateSubscriptionIntent } from "@autumn/shared";

/** Returns true for billing flows where `proration_behavior` is semantically
 * irrelevant and should be ignored end-to-end. Single source of truth for the
 * "bypass" rules — keep downstream consumers free of intent/product-type checks. */
export const setupIgnoreProrationBehavior = ({
	intent,
	isOneOffAttach,
}: {
	intent?: UpdateSubscriptionIntent;
	isOneOffAttach?: boolean;
}): boolean => {
	if (intent === UpdateSubscriptionIntent.ManualTopUp) return true;
	if (isOneOffAttach) return true;
	return false;
};
