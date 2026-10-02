import {
	type BillingBehavior,
	type CreateScheduleBillingContext,
	isCustomerProductOnStripeSubscription,
	secondsToMs,
} from "@autumn/shared";
import { getLatestPeriodEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils";
import type { SetPlansTimeline } from "../types/setPlansTimeline";

type KeptSubscriptionCycle = Partial<
	Pick<
		CreateScheduleBillingContext,
		"billingCycleAnchorMs" | "requestedProrationBehavior"
	>
>;

/** A replacement subscription for kept plans continues their paid cycle: anchored on the old period end, charging nothing before it. */
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
	if (!replacedStripeSubscription?.items.data.length) return {};

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

	const periodEndMs = secondsToMs(
		getLatestPeriodEnd({ sub: replacedStripeSubscription }),
	);
	if (periodEndMs <= currentEpochMs) return {};

	return {
		billingCycleAnchorMs: periodEndMs,
		requestedProrationBehavior: requestedProrationBehavior ?? "none",
	};
};
