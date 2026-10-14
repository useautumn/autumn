import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";

type TrialingSubscriptionFields = Pick<
	BillingContext,
	"stripeSubscription" | "replacedStripeSubscription"
>;

export const trialingStripeSubscription = ({
	billingContext,
}: {
	billingContext: TrialingSubscriptionFields;
}) =>
	billingContext.stripeSubscription ??
	billingContext.replacedStripeSubscription;

export const endsLiveTrial = ({
	billingContext,
}: {
	billingContext: TrialingSubscriptionFields &
		Pick<BillingContext, "trialContext" | "currentEpochMs"> & {
			immediatePhase?: { starts_at: number };
		};
}) => {
	const { immediatePhase, currentEpochMs } = billingContext;
	const startsLater =
		immediatePhase !== undefined &&
		classifyFirstPhaseStart({
			startsAt: immediatePhase.starts_at,
			currentEpochMs,
		}) === "future";
	return (
		!startsLater &&
		isStripeSubscriptionTrialing(
			trialingStripeSubscription({ billingContext }),
		) &&
		billingContext.trialContext?.trialEndsAt === null
	);
};
