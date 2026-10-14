import type { TrialContext } from "@autumn/shared";
import type Stripe from "stripe";
import { isRevertTrialContext } from "./isRevertTrialContext";

const isNoCardTrialWithoutSubscription = ({
	trialContext,
	stripeSubscription,
}: {
	trialContext: TrialContext;
	stripeSubscription?: Stripe.Subscription;
}) =>
	trialContext.cardRequired === false &&
	trialContext.appliesToBilling &&
	trialContext.trialEndsAt !== null &&
	!stripeSubscription;

export const markAutumnManagedTrialContext = ({
	trialContext,
	stripeSubscription,
	skipBillingChangesBase,
}: {
	trialContext?: TrialContext;
	stripeSubscription?: Stripe.Subscription;
	skipBillingChangesBase: boolean;
}): TrialContext | undefined => {
	if (!trialContext || skipBillingChangesBase) return trialContext;

	const isAutumnManaged =
		isRevertTrialContext({ trialContext }) ||
		isNoCardTrialWithoutSubscription({ trialContext, stripeSubscription });

	return isAutumnManaged
		? { ...trialContext, autumnManaged: true }
		: trialContext;
};
