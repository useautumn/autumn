import type {
	MultiAttachBillingContext,
	StripeSubscriptionScope,
} from "@autumn/shared";
import { replaysLiveStart } from "../utils/replaysLiveStart";
import { classifyFirstPhaseStart } from "./classifyFirstPhaseStart";
import {
	type LiveSubscriptionFields,
	replaceStripeSubscription,
} from "./replaceStripeSubscription";

/** A past start away from the live start can't move a live subscription, so the subscription and its schedule are recreated from it. */
export const replaceLiveSubscriptionForBackdate = ({
	billingContext,
	immediatePhase,
	stripeSubscriptionScope,
}: {
	billingContext: Pick<
		MultiAttachBillingContext,
		| "currentEpochMs"
		| "fullCustomer"
		| "stripeSubscription"
		| "stripeSubscriptionSchedule"
	>;
	immediatePhase: { starts_at: number };
	stripeSubscriptionScope?: StripeSubscriptionScope;
}): LiveSubscriptionFields => {
	const { stripeSubscription, stripeSubscriptionSchedule } = billingContext;
	if (!stripeSubscription) return {};

	const backdatesFirstPhase =
		classifyFirstPhaseStart({
			startsAt: immediatePhase.starts_at,
			currentEpochMs: billingContext.currentEpochMs,
		}) === "past";
	if (!backdatesFirstPhase) return {};

	if (
		replaysLiveStart({
			startsAt: immediatePhase.starts_at,
			fullCustomer: billingContext.fullCustomer,
			stripeSubscription,
			stripeSubscriptionSchedule,
			stripeSubscriptionScope,
		})
	) {
		return {};
	}

	return replaceStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule,
	});
};
