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
