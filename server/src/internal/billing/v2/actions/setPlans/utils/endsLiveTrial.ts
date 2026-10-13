import type { BillingContext } from "@autumn/shared";
import { isStripeSubscriptionTrialing } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";

type TrialingSubscriptionFields = Pick<
	BillingContext,
	"stripeSubscription" | "replacedStripeSubscription"
>;

/** The live Stripe subscription, whether kept or already moved aside to be replaced. */
export const trialingStripeSubscription = ({
	billingContext,
}: {
	billingContext: TrialingSubscriptionFields;
}) =>
	billingContext.stripeSubscription ??
	billingContext.replacedStripeSubscription;

/** The request removes the trial the live Stripe subscription runs from a first phase starting now or backdated. */
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
