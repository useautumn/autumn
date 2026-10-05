import type {
	MultiAttachBillingContext,
	StripeSubscriptionScope,
} from "@autumn/shared";
import { isExistingScheduleUpdate } from "../utils/isExistingScheduleUpdate";
import {
	startsBeforeLivePlans,
	startsWithLivePlans,
} from "../utils/startsBeforeLivePlans";
import { classifyFirstPhaseStart } from "./classifyFirstPhaseStart";
import {
	type LiveSubscriptionFields,
	replaceStripeSubscription,
} from "./replaceStripeSubscription";

/** A backdated first phase can't move a live subscription's start, so the subscription and its schedule are recreated from it. */
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

	const livePlansStart = {
		startsAt: immediatePhase.starts_at,
		fullCustomer: billingContext.fullCustomer,
		stripeSubscriptionScope,
	};
	const replaysScheduledStart =
		isExistingScheduleUpdate({
			billingContext: { ...billingContext, stripeSubscriptionScope },
		}) && !startsBeforeLivePlans(livePlansStart);
	if (replaysScheduledStart || startsWithLivePlans(livePlansStart)) return {};

	return replaceStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule,
	});
};
