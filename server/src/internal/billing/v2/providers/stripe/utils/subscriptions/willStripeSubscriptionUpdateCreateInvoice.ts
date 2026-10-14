import {
	addInterval,
	type BillingContext,
	type BillingInterval,
	type EntInterval,
	isFixedPrice,
	isOneOffPrice,
	type Price,
	type StripeSubscriptionAction,
	secondsToMs,
} from "@autumn/shared";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

type StripeSubscriptionUpdateAction = Extract<
	StripeSubscriptionAction,
	{ type: "update" }
>;

/** cancel_at in effect when the trial ends; an anchor reset ends it in an earlier call that leaves cancel_at as is. */
const cancelAtWhenTrialEnds = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction: StripeSubscriptionUpdateAction;
}) => {
	const currentCancelAt = billingContext.stripeSubscription?.cancel_at ?? null;
	if (billingContext.requestedBillingCycleAnchor === "now")
		return currentCancelAt;

	const requestedCancelAt = stripeSubscriptionAction.params.cancel_at;
	if (requestedCancelAt === undefined) return currentCancelAt;
	return typeof requestedCancelAt === "number" ? requestedCancelAt : null;
};

/** Mirrors cusPriceToStripeItemSpec, which never sends a free fixed price to Stripe. */
const becomesRecurringStripeItem = (price: Price) => {
	if (isOneOffPrice(price)) return false;
	return !isFixedPrice(price) || (price.config.amount ?? 0) > 0;
};

type Recurrence = {
	interval: BillingInterval | EntInterval;
	intervalCount: number;
};

/** Recurrences billed once the trial ends: the update's items, unless an anchor reset ends it on the current ones. */
const recurrencesWhenTrialEnds = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction: StripeSubscriptionUpdateAction;
}): Recurrence[] => {
	const itemUpdates = stripeSubscriptionAction.params.items ?? [];
	const endsTrialOnCurrentItems =
		billingContext.requestedBillingCycleAnchor === "now";
	const deletedItemIds = new Set(
		endsTrialOnCurrentItems
			? []
			: itemUpdates.filter((item) => item.deleted).map((item) => item.id),
	);
	const keptRecurrences = (billingContext.stripeSubscription?.items.data ?? [])
		.filter((item) => !deletedItemIds.has(item.id))
		.flatMap(({ price: { recurring } }) =>
			recurring
				? [
						{
							interval: recurring.interval as EntInterval,
							intervalCount: recurring.interval_count,
						},
					]
				: [],
		);

	const addsItems = itemUpdates.some((item) => !item.id && !item.deleted);
	if (endsTrialOnCurrentItems || !addsItems) return keptRecurrences;

	const incomingRecurrences = billingContext.fullProducts
		.flatMap((fullProduct) => fullProduct.prices)
		.filter(becomesRecurringStripeItem)
		.map((price) => ({
			interval: price.config.interval as BillingInterval,
			intervalCount: price.config.interval_count ?? 1,
		}));
	return [...keptRecurrences, ...incomingRecurrences];
};

/** End of the first paid period: the soonest item to renew sets it. */
const firstPeriodEndMs = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction: StripeSubscriptionUpdateAction;
}) => {
	const periodEnds = recurrencesWhenTrialEnds({
		billingContext,
		stripeSubscriptionAction,
	}).map(({ interval, intervalCount }) =>
		addInterval({
			from: billingContext.currentEpochMs,
			interval,
			intervalCount,
		}),
	);
	return periodEnds.length > 0 ? Math.min(...periodEnds) : undefined;
};

export const willStripeSubscriptionUpdateCreateInvoice = ({
	billingContext,
	stripeSubscriptionAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}): boolean => {
	if (stripeSubscriptionAction?.type !== "update") return false;

	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	if (!isTrialing || willBeTrialing) return false;

	const cancelAt = cancelAtWhenTrialEnds({
		billingContext,
		stripeSubscriptionAction,
	});
	if (cancelAt === null) return true;

	// Flexible-mode Stripe cuts a period that cancel_at ends early and invoices nothing for it.
	const periodEndMs = firstPeriodEndMs({
		billingContext,
		stripeSubscriptionAction,
	});
	return periodEndMs === undefined || secondsToMs(cancelAt) >= periodEndMs;
};
