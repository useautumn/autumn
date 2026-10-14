import {
	type BillingContext,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { replacedSubscriptionPeriodEndMs } from "@/internal/billing/v2/setup/carryReplacedSubscription/replacedSubscriptionPeriodEndMs";
import { isBackdateRecreate } from "./isBackdateRecreate";

export const paidBackdateAnchorMove = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		| "replacedStripeSubscription"
		| "subscriptionBackdateStartMs"
		| "requestedBillingCycleAnchor"
	>;
}): { anchorMs: number; paidThroughMs: number } | undefined => {
	const { requestedBillingCycleAnchor: anchorMs } = billingContext;
	if (!isBackdateRecreate({ billingContext })) return undefined;
	if (typeof anchorMs !== "number") return undefined;

	const paidThroughMs = replacedSubscriptionPeriodEndMs(billingContext);
	if (paidThroughMs === undefined) return undefined;
	if (truncateMsToSecondPrecision(anchorMs) === paidThroughMs) return undefined;
	return { anchorMs, paidThroughMs };
};
