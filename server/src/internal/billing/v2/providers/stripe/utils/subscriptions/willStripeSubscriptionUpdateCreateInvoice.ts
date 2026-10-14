import {
	addInterval,
	type BillingContext,
	type EntInterval,
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

/** End of the first paid period: the soonest item to renew sets it. */
const firstPeriodEndMs = ({
	billingContext,
}: {
	billingContext: BillingContext;
}) => {
	const periodEnds = (billingContext.stripeSubscription?.items.data ?? [])
		.map((item) => item.price.recurring)
		.filter((recurring) => recurring !== null)
		.map((recurring) =>
			addInterval({
				from: billingContext.currentEpochMs,
				interval: recurring.interval as EntInterval,
				intervalCount: recurring.interval_count,
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
	const periodEndMs = firstPeriodEndMs({ billingContext });
	return periodEndMs === undefined || secondsToMs(cancelAt) >= periodEndMs;
};
