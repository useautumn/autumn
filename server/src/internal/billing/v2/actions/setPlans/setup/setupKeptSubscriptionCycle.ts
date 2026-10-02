import {
	type BillingBehavior,
	type CreateScheduleBillingContext,
	getCycleEnd,
	getSmallestInterval,
	isCustomerProductOnStripeSubscription,
} from "@autumn/shared";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { replacedSubscriptionPeriodEndMs } from "../utils/replacedSubscriptionPeriodEndMs";
import { restartsCycleAtBackdatedStart } from "../utils/restartsCycleAtBackdatedStart";

type KeptSubscriptionCycle = Partial<
	Pick<
		CreateScheduleBillingContext,
		"billingCycleAnchorMs" | "requestedProrationBehavior"
	>
>;

/** The first renewal of a cycle restarted on the backdated start: its next boundary after now. */
const backdatedCycleRenewalMs = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { subscriptionBackdateStartMs, currentEpochMs, fullProducts } =
		billingContext;
	const smallestInterval = getSmallestInterval({
		prices: fullProducts.flatMap(({ prices }) => prices),
		excludeOneOff: true,
	});
	if (subscriptionBackdateStartMs === undefined || !smallestInterval) {
		return undefined;
	}

	return getCycleEnd({
		anchor: subscriptionBackdateStartMs,
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
		now: currentEpochMs,
	});
};

/**
 * A replacement subscription for kept plans continues their paid cycle: anchored on the old period end, charging nothing before it.
 * A backdate recreate does too unless it restarts the cycle on its start, and leaves proration to the plan changes it makes.
 */
export const setupKeptSubscriptionCycle = ({
	billingContext,
	timeline,
	requestedProrationBehavior,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
	requestedProrationBehavior?: BillingBehavior;
}): KeptSubscriptionCycle => {
	const { replacedStripeSubscription, currentEpochMs } = billingContext;
	if (!replacedStripeSubscription) return {};

	const periodEndMs = replacedSubscriptionPeriodEndMs({
		replacedStripeSubscription,
	});
	if (periodEndMs === undefined || periodEndMs <= currentEpochMs) return {};

	if (isBackdateRecreate({ billingContext })) {
		const billingCycleAnchorMs = restartsCycleAtBackdatedStart({
			billingContext,
		})
			? (backdatedCycleRenewalMs({ billingContext }) ?? periodEndMs)
			: periodEndMs;
		return { billingCycleAnchorMs, requestedProrationBehavior };
	}

	const declaredSegmentIds = new Set(
		timeline.diff.timeline
			.filter(({ origin }) => origin === "declared")
			.map(({ id }) => id),
	);
	const keptCustomerProductIds = new Set(
		timeline.diff.operations.flatMap((operation) =>
			operation.type === "keep" && declaredSegmentIds.has(operation.segmentId)
				? [operation.customerProductId]
				: [],
		),
	);
	const keepsReplacedPlan = billingContext.fullCustomer.customer_products.some(
		(customerProduct) =>
			keptCustomerProductIds.has(customerProduct.id) &&
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId: replacedStripeSubscription.id,
			}),
	);
	if (!keepsReplacedPlan) return {};

	return {
		billingCycleAnchorMs: periodEndMs,
		requestedProrationBehavior: requestedProrationBehavior ?? "none",
	};
};
