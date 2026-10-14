import {
	type BillingBehavior,
	type CreateScheduleBillingContext,
	cusProductToPrices,
	type FullCusProduct,
	getCycleEnd,
	getSmallestInterval,
} from "@autumn/shared";
import { replacedSubscriptionPeriodEndMs } from "@/internal/billing/v2/setup/carryReplacedSubscription/replacedSubscriptionPeriodEndMs";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { billingCycleAnchorToApply } from "../utils/billingCycleAnchorToApply";
import { endsLiveTrial } from "../utils/endsLiveTrial";
import { filterOnReplacedStripeSubscription } from "../utils/filterOnReplacedStripeSubscription";
import { isBackdateRecreate } from "../utils/isBackdateRecreate";
import { isTrialBackdateRecreate } from "../utils/isTrialBackdateRecreate";
import { restartsCycleAtBackdatedStart } from "../utils/restartsCycleAtBackdatedStart";

type KeptSubscriptionCycle = Partial<
	Pick<
		CreateScheduleBillingContext,
		"billingCycleAnchorMs" | "requestedProrationBehavior"
	>
>;

const keptCustomerProductsOnReplacedSubscription = ({
	billingContext,
	operations,
}: {
	billingContext: CreateScheduleBillingContext;
	operations: SetPlansTimeline["diff"]["operations"];
}): FullCusProduct[] => {
	const keptCustomerProductIds = new Set(
		operations.flatMap((operation) =>
			operation.type === "keep" ? [operation.customerProductId] : [],
		),
	);
	return filterOnReplacedStripeSubscription({
		billingContext,
		customerProducts: billingContext.fullCustomer.customer_products.filter(
			({ id }) => keptCustomerProductIds.has(id),
		),
	});
};

const backdatedCycleRenewalMs = ({
	billingContext,
	timeline,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}) => {
	const { subscriptionBackdateStartMs, currentEpochMs, fullProducts } =
		billingContext;
	const keptCustomerProducts = keptCustomerProductsOnReplacedSubscription({
		billingContext,
		operations: timeline.diff.operations,
	});
	const smallestInterval = getSmallestInterval({
		prices: [
			...fullProducts.flatMap(({ prices }) => prices),
			...keptCustomerProducts.flatMap((customerProduct) =>
				cusProductToPrices({ cusProduct: customerProduct }),
			),
		],
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

const keptPlansAnchorMs = ({
	billingContext,
	periodEndMs,
}: {
	billingContext: CreateScheduleBillingContext;
	periodEndMs: number;
}) => {
	const { subscriptionBackdateStartMs } = billingContext;
	const anchorMs = billingCycleAnchorToApply({ billingContext });
	if (typeof anchorMs === "number") return anchorMs;
	const anchorsOnBackdatedStart =
		isTrialBackdateRecreate({ billingContext }) &&
		endsLiveTrial({ billingContext });
	return anchorsOnBackdatedStart && subscriptionBackdateStartMs !== undefined
		? subscriptionBackdateStartMs
		: periodEndMs;
};

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
			? (backdatedCycleRenewalMs({ billingContext, timeline }) ?? periodEndMs)
			: keptPlansAnchorMs({ billingContext, periodEndMs });
		return { billingCycleAnchorMs, requestedProrationBehavior };
	}

	const declaredSegmentIds = new Set(
		timeline.diff.timeline
			.filter(({ origin }) => origin === "declared")
			.map(({ id }) => id),
	);
	const keepsReplacedPlan =
		keptCustomerProductsOnReplacedSubscription({
			billingContext,
			operations: timeline.diff.operations.filter(
				(operation) =>
					operation.type === "keep" &&
					declaredSegmentIds.has(operation.segmentId),
			),
		}).length > 0;
	if (!keepsReplacedPlan) return {};

	// Like Stripe's create on a future anchor, nothing is billed before it unless proration is requested;
	// an anchor after a kept trial is always prorated, since Stripe rejects none there.
	const alwaysProrates = billingContext.prorationOverride === "always_prorates";
	const defaultProrationBehavior: BillingBehavior = alwaysProrates
		? "prorate_immediately"
		: "none";
	return {
		billingCycleAnchorMs: keptPlansAnchorMs({ billingContext, periodEndMs }),
		requestedProrationBehavior:
			requestedProrationBehavior ?? defaultProrationBehavior,
	};
};
