import type {
	MultiAttachBillingContext,
	StripeSubscriptionScope,
} from "@autumn/shared";
import { isExistingScheduleUpdate } from "../utils/isExistingScheduleUpdate";
import { classifyFirstPhaseStart } from "./classifyFirstPhaseStart";
import { splitReplacedStripeSubscription } from "./splitReplacedStripeSubscription";

type LiveSubscriptionFields = Partial<
	Pick<
		MultiAttachBillingContext,
		| "stripeSubscription"
		| "stripeSubscriptionSchedule"
		| "replacedStripeSubscription"
	>
>;

/** A backdated first phase can't move a live subscription's start, so the subscription is recreated from it. */
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
		isExistingScheduleUpdate({
			billingContext: { ...billingContext, stripeSubscriptionScope },
		})
	) {
		return {};
	}

	return splitReplacedStripeSubscription({
		stripeSubscription,
		stripeSubscriptionSchedule,
		backdatesFirstPhase,
	});
};
