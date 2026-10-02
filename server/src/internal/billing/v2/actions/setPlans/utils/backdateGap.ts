import {
	type BillingContext,
	type BillingPeriod,
	secondsToMs,
} from "@autumn/shared";
import { isBackdateRecreate } from "./isBackdateRecreate";

/** The backdated time before the replaced subscription started, which it never paid for. */
export const backdateGap = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}): BillingPeriod | undefined => {
	const { replacedStripeSubscription, subscriptionBackdateStartMs } =
		billingContext;
	if (!isBackdateRecreate({ billingContext })) return undefined;
	if (!replacedStripeSubscription || subscriptionBackdateStartMs === undefined)
		return undefined;

	const replacedStartMs = secondsToMs(replacedStripeSubscription.start_date);
	if (!(subscriptionBackdateStartMs < replacedStartMs)) return undefined;

	return { start: subscriptionBackdateStartMs, end: replacedStartMs };
};

/** Omitted or "none" leaves the gap unbilled; the other behaviors bill it. */
export const billsBackdateGap = ({
	billingContext,
}: {
	billingContext: Pick<BillingContext, "requestedProrationBehavior">;
}) =>
	billingContext.requestedProrationBehavior === "prorate_immediately" ||
	billingContext.requestedProrationBehavior === "bill_difference";
